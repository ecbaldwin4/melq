import crypto from 'crypto';

export class AESCrypto {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32; // 256 bits
    this.ivLength = 12; // 96 bits for GCM
  }

  generateKey() {
    return crypto.randomBytes(this.keyLength);
  }

  encrypt(plaintext, key) {
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    cipher.setAAD(Buffer.from('melq-chat', 'utf8'));
    
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64')
    };
  }

  decrypt(encryptedData, key) {
    const { encrypted, iv, authTag } = encryptedData;
    
    const decipher = crypto.createDecipheriv(this.algorithm, key, Buffer.from(iv, 'base64'));
    decipher.setAAD(Buffer.from('melq-chat', 'utf8'));
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));
    
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  deriveKeyFromSharedSecret(sharedSecret) {
    return crypto.pbkdf2Sync(
      Buffer.from(sharedSecret, 'base64'),
      Buffer.from('melq-salt', 'utf8'),
      100000,
      this.keyLength,
      'sha256'
    );
  }
}