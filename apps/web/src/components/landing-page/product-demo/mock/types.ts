export type DemoLabel = {
  name: string;
  color: string;
};

export type DemoMessage = {
  authorName: string;
  content: string;
};

export type DemoThread = {
  id: string;
  title: string;
  authorName: string;
  assignedUserName?: string;
  priority: number;
  status: number;
  labels: DemoLabel[];
  lastMessage: DemoMessage;
  createdAt: Date;
};


