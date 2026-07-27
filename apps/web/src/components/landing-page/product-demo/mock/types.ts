export interface DemoLabel {
  name: string;
  color: string;
}

export interface DemoMessage {
  authorName: string;
  content: string;
}

export interface DemoThread {
  id: string;
  title: string;
  authorName: string;
  assignedUserName?: string;
  priority: number;
  status: number;
  labels: DemoLabel[];
  lastMessage: DemoMessage;
  createdAt: Date;
}
