import { describe, expect, it } from "vitest";
import { amountInWords, numberToWordsEn, numberToWordsRo } from "./numberToWords";

describe("numberToWordsRo", () => {
  it.each([
    [0, "zero"],
    [1, "unu"],
    [5, "cinci"],
    [12, "doisprezece"],
    [19, "nouăsprezece"],
    [20, "douăzeci"],
    [21, "douăzeci și unu"],
    [100, "o sută"],
    [101, "o sută unu"],
    [235, "două sute treizeci și cinci"],
    [1000, "o mie"],
    [2000, "două mii"],
    [3500, "trei mii cinci sute"],
    [21000, "douăzeci și una de mii"],
    [100000, "o sută de mii"],
    [1000000, "un milion"],
    [2500000, "două milioane cinci sute de mii"],
    [12000, "douăsprezece mii"],
    [112000, "o sută douăsprezece mii"],
    [12000000, "douăsprezece milioane"],
  ])("%i → %s", (n, expected) => {
    expect(numberToWordsRo(n)).toBe(expected);
  });
});

describe("numberToWordsEn", () => {
  it.each([
    [0, "zero"],
    [21, "twenty-one"],
    [100, "one hundred"],
    [3500, "three thousand five hundred"],
    [1000000, "one million"],
  ])("%i → %s", (n, expected) => {
    expect(numberToWordsEn(n)).toBe(expected);
  });
});

describe("amountInWords", () => {
  it("RON cu bani", () => {
    expect(amountInWords(1234.56, "RON", "ro")).toBe(
      "o mie două sute treizeci și patru lei și cincizeci și șase de bani",
    );
  });
  it("EUR întreg", () => {
    expect(amountInWords(3500, "EUR", "ro")).toBe("trei mii cinci sute euro");
  });
  it("USD engleză", () => {
    expect(amountInWords(3500.5, "USD", "en")).toBe(
      "three thousand five hundred dollars and fifty cents",
    );
  });
  it("valută necunoscută → codul", () => {
    expect(amountInWords(10, "GBP", "ro")).toBe("zece GBP");
  });
});
