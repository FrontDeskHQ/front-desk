export function IssuesSection({ threadId }: { threadId: string }) {
  console.log("threadId", threadId);

  return (
    <div className="flex flex-col gap-2">
      <div className="text-foreground-secondary text-xs">Issues</div>
      <div className="flex flex-col gap-1.5">
        {/* TODO: Implement issues combobox */}
        <div className="text-muted-foreground">
          Issues section - Coming soon
        </div>
      </div>
    </div>
  );
}
