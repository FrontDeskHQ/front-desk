export type FrontDeskPage = "threads" | "signals";

export type {
  MockAuthor,
  MockLabel,
  MockMessage,
  MockThreadState,
} from "../../shared/thread-detail-mock";

export interface MockSignalCardData {
  title: string;
  shortId: number;
  authorName: string;
  summary: string;
  recommendation: string;
  createdAt: Date;
  urgencyScore: number;
}
