import { MlKem768 } from 'mlkem';

export class MLKEM {
  constructor() {
    this.mlkem = new MlKem768(); // Using ML-KEM-768 (192-bit security)
  }

  async generateKeyPair() {
    const [publicKey, privateKey] = await this.mlkem.generateKeyPair();
    
    return {
      publicKey: Buffer.from(publicKey).toString('base64'),
      privateKey: Buffer.from(privateKey).toString('base64')
    };
  }

  async encapsulate(publicKeyBase64) {
    const publicKey = new Uint8Array(Buffer.from(publicKeyBase64, 'base64'));
    const [ciphertext, sharedSecret] = await this.mlkem.encap(publicKey);
    
    return {
      ciphertext: Buffer.from(ciphertext).toString('base64'),
      sharedSecret: Buffer.from(sharedSecret).toString('base64')
    };
  }

  async decapsulate(ciphertextBase64, privateKeyBase64) {
    const ciphertext = new Uint8Array(Buffer.from(ciphertextBase64, 'base64'));
    const privateKey = new Uint8Array(Buffer.from(privateKeyBase64, 'base64'));
    
    const sharedSecret = await this.mlkem.decap(ciphertext, privateKey);
    
    return Buffer.from(sharedSecret).toString('base64');
  }
}