export const isValidFullName = (value) =>
  /^[A-Za-z\s]{3,}$/.test(value.trim());

export const isValidPhoneNumber = (value) =>
  /^(\+62|62|0)8[1-9][0-9]{7,10}$/.test(value.trim());

export const isValidEmail = (value) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export const PASSWORD_MIN = 8;

export const isValidPassword = (value) => value.length >= PASSWORD_MIN;

export const PHONE_MAX_LENGTH = 13;

/** Buang semua karakter selain angka & batasi panjang — dipakai saat mengetik di input No. HP. */
export const sanitizePhoneInput = (value, maxLength = PHONE_MAX_LENGTH) =>
  value.replace(/\D/g, "").slice(0, maxLength);

export const BLOK_RUMAH_REGEX = /^E\d{1,2}\/\d{1,2}$/;

export const isValidBlokRumah = (value) => BLOK_RUMAH_REGEX.test(value.trim());
