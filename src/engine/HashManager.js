// A static class to manage hash functions and seed generation
export default class HashManager {

  /**
   * Generates a 32-bit hash from a given string using the sfc32 algorithm.
   *
   * @param {string} str - The input string to hash.
   * @returns {number} A 32-bit unsigned integer hash of the input string.
   */
  static HashString = (str) => {
    const seed4 = HashManager.GetSeed4FromString(str);
    const randFunc = HashManager.Sfc32(seed4[0], seed4[1], seed4[2], seed4[3]);
    return Math.floor(randFunc() * 2 ** 32) >>> 0;
  }

  /**
   * Generates a pseudo-random number generator function using the sfc32 algorithm.
   *
   * @param {number} a - The first seed value.
   * @param {number} b - The second seed value.
   * @param {number} c - The third seed value.
   * @param {number} d - The fourth seed value.
   * @returns {function} A function that, when called, returns a pseudo-random number between 0..1 (exclusive).
   */
  static Sfc32(a, b, c, d) {
    return function () {
      a |= 0; b |= 0; c |= 0; d |= 0;
      let t = (a + b | 0) + d | 0;
      d = d + 1 | 0;
      a = b ^ b >>> 9;
      b = c + (c << 3) | 0;
      c = (c << 21 | c >>> 11);
      c = c + t | 0;
      return (t >>> 0) / 4294967296;
    }
  }

  /**
   * Generates a 128-bit hash from a given string using the cyrb128 algorithm.
   *
   * @param {string} str - The input string to hash.
   * @returns {number[]} An array of four 32-bit unsigned integers representing the 128-bit hash.
   */
  static GetSeed4FromString(str) {
    let h1 = 1779033703, h2 = 3144134277,
      h3 = 1013904242, h4 = 2773480762;
    for (let i = 0, k; i < str.length; i++) {
      k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    h1 ^= (h2 ^ h3 ^ h4), h2 ^= h1, h3 ^= h1, h4 ^= h1;
    return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
  }

  // Generates a random seed value
  static SeedGen = () => (Math.random() * 2 ** 32) >>> 0;
  static GetRandomSeed4 = () => [HashManager.SeedGen(), HashManager.SeedGen(), HashManager.SeedGen(), HashManager.SeedGen()];

  /**
   * Generates a random function using the sfc32 algorithm and a seed value based on 4 32-bit integers
   *
   * @param {Array<number>} seed4 - An array of four numbers used as the seed for the random function.
   * @returns {function} A pseudo-random number generator function (0..1)
   */
  static GetRandomFunction = (seed4) => HashManager.Sfc32(seed4[0], seed4[1], seed4[2], seed4[3]);
}