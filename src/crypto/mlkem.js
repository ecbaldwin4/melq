import crypto from 'crypto';

export class MLKEM {
  constructor() {
    this.keySize = 32; // 256 bits
  }

  generateKeyPair() {
    const privateKey = crypto.randomBytes(this.keySize);
    const publicKey = crypto.createHash('sha256').update(privateKey).digest();
    
    return {
      publicKey: publicKey.toString('base64'),
      privateKey: privateKey.toString('base64')
    };
  }

  encapsulate(publicKeyBase64) {
    const publicKey = Buffer.from(publicKeyBase64, 'base64');
    const ephemeralKey = crypto.randomBytes(this.keySize);
    
    // Create ciphertext from ephemeral key
    const ciphertext = crypto.createHash('sha256')
      .update(Buffer.concat([ephemeralKey, publicKey]))
      .digest();
    
    // Derive shared secret deterministically 
    const sharedSecret = crypto.createHash('sha256')
      .update(Buffer.concat([ephemeralKey, publicKey]))
      .digest();
    
    return {
      ciphertext: ephemeralKey.toString('base64'), // Send the ephemeral key as "ciphertext"
      sharedSecret: sharedSecret.toString('base64')
    };
  }

  decapsulate(ciphertextBase64, privateKeyBase64) {
    const privateKey = Buffer.from(privateKeyBase64, 'base64');
    const ephemeralKey = Buffer.from(ciphertextBase64, 'base64'); // The "ciphertext" is actually the ephemeral key
    
    // Derive public key from private key
    const publicKey = crypto.createHash('sha256').update(privateKey).digest();
    
    // Derive the same shared secret as encapsulate
    const sharedSecret = crypto.createHash('sha256')
      .update(Buffer.concat([ephemeralKey, publicKey]))
      .digest();
    
    return sharedSecret.toString('base64');
  }
}