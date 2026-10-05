import { Question } from "./types";

export const EXAM_QUESTIONS: Question[] = [
  {
    id: "q1",
    title: "Reverse a String",
    difficulty: "Easy",
    description:
      "Write a function `solution(str)` that accepts a string and returns it reversed.\n\nExample:\nInput: 'hello'\nOutput: 'olleh'",
    starterCode: `function solution(str) {\n  // Write your code here\n  \n}`,
    timeLimitMinutes: 10,
  },
  {
    id: "q2",
    title: "Count Vowels",
    difficulty: "Easy",
    description:
      "Write a function `solution(str)` that returns the count of vowels (a, e, i, o, u) in a given string (case-insensitive).\n\nExample:\nInput: 'Informatics'\nOutput: 4",
    starterCode: `function solution(str) {\n  // Write your code here\n  \n}`,
    timeLimitMinutes: 10,
  },
  {
    id: "q3",
    title: "Find Missing Number",
    difficulty: "Medium",
    description:
      "Given an array `nums` containing `n` distinct numbers in the range `[0, n]`, return the only number in the range that is missing from the array.\n\nExample:\nInput: [3, 0, 1]\nOutput: 2",
    starterCode: `function solution(nums) {\n  // Write your code here\n  \n}`,
    timeLimitMinutes: 15,
  },
];