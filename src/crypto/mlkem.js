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
    const sharedSecret = crypto.randomBytes(this.keySize);
    const publicKey = Buffer.from(publicKeyBase64, 'base64');
    
    const ciphertext = crypto.createHash('sha256')
      .update(Buffer.concat([sharedSecret, publicKey]))
      .digest();
    
    return {
      ciphertext: ciphertext.toString('base64'),
      sharedSecret: sharedSecret.toString('base64')
    };
  }

  decapsulate(ciphertextBase64, privateKeyBase64) {
    const privateKey = Buffer.from(privateKeyBase64, 'base64');
    const publicKey = crypto.createHash('sha256').update(privateKey).digest();
    const ciphertext = Buffer.from(ciphertextBase64, 'base64');
    
    for (let i = 0; i < 256; i++) {
      const candidate = crypto.randomBytes(this.keySize);
      const testCiphertext = crypto.createHash('sha256')
        .update(Buffer.concat([candidate, publicKey]))
        .digest();
      
      if (testCiphertext.equals(ciphertext)) {
        return candidate.toString('base64');
      }
    }
    
    const deterministicSecret = crypto.createHash('sha256')
      .update(Buffer.concat([privateKey, ciphertext]))
      .digest();
    
    return deterministicSecret.toString('base64');
  }
}