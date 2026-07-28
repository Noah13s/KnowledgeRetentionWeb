export interface Category {
  id: string;
  Name: string;
  Description: string;
  ImageFile: string;
  quizFiles: string[];
  subCategories: Category[];
}

export interface Quiz {
  quizName: string;
  questionType: string;
  question: string;
  questionImage: string;
  webSearch: string;
  answerType: string;
  inputAnswerType: string;
  inputAnswer: string;
  category?: string;
  categoryId?: string;
  answers: any[];
}