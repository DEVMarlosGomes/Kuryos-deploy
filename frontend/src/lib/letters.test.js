import { indexToLetters } from "./letters";

test("indexToLetters converts 0-based index to spreadsheet-style column letters", () => {
  expect(indexToLetters(0)).toBe("A");
  expect(indexToLetters(25)).toBe("Z");
  expect(indexToLetters(26)).toBe("AA");
  expect(indexToLetters(27)).toBe("AB");
  expect(indexToLetters(51)).toBe("AZ");
  expect(indexToLetters(52)).toBe("BA");
  expect(indexToLetters(701)).toBe("ZZ");
  expect(indexToLetters(702)).toBe("AAA");
});

test("indexToLetters supports lowercase mode", () => {
  expect(indexToLetters(0, "lower")).toBe("a");
  expect(indexToLetters(26, "lower")).toBe("aa");
});
