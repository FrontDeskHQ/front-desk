export interface MockAuthor {
  name: string;
}

export interface MockMessage {
  id: string;
  author: MockAuthor;
  content: string;
  createdAt: Date;
  markedAsAnswer: boolean;
}

export interface MockLabel {
  name: string;
  color: string;
}

export interface MockThreadState {
  title: string;
  shortId: number;
  status: number;
  priority: number;
  assignedUserName: string | null;
  labels: MockLabel[];
}

export interface MockStatusSuggestion {
  status: number;
  label: string;
}
