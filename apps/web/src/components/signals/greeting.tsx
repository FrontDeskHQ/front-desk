type Props = {
  userName: string;
};

export function Greeting({ userName }: Props) {
  const greeting = greetingFor(new Date());
  const firstName = userName.trim().split(/\s+/)[0] ?? userName;

  return (
    <div className="flex w-full max-w-4xl mx-auto flex-col px-1">
      <div className="text-foreground-primary text-2xl">
        {greeting}, {firstName}.
      </div>
    </div>
  );
}

function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
