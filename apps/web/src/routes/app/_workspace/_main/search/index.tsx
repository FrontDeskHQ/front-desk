import { useLiveQuery } from "@live-state/sync/client";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Avatar } from "@workspace/ui/components/avatar";
import { RichText } from "@workspace/ui/components/blocks/tiptap";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import {
  PriorityIndicator,
  StatusIndicator,
} from "@workspace/ui/components/indicator";
import { Input } from "@workspace/ui/components/input";
import { LabelBadge } from "@workspace/ui/components/label-badge";
import { safeParseJSON } from "@workspace/ui/lib/tiptap";
import { formatRelativeTime } from "@workspace/ui/lib/utils";
import { useAtomValue } from "jotai/react";
import { CircleUser, Search } from "lucide-react";
import {
  createStandardSchemaV1,
  debounce,
  parseAsString,
  useQueryState,
} from "nuqs";
import { useEffect, useState } from "react";
import { activeOrganizationAtom } from "~/lib/atoms";
import { fetchClient, query } from "~/lib/live-state";

type SearchResultItemProps = {
  messageId: string;
};

const SearchResultItem = ({ messageId }: SearchResultItemProps) => {
  const message = useLiveQuery(
    query.message.where({ id: messageId }).include({
      author: true,
      thread: {
        author: true,
        labels: {
          label: true,
        },
        assignedUser: true,
      },
    }),
  )?.[0];

  if (!message) {
    return null;
  }

  const thread = message.thread;

  return (
    <div className="flex flex-col gap-2 relative">
      <Link
        to="/app/threads/$id"
        params={{ id: thread.id }}
        className="w-full flex flex-col py-2 gap-2 rounded-md hover:underline"
      >
        <div className="flex justify-between">
          <div className="flex items-center gap-2">
            <Avatar variant="user" size="md" fallback={thread?.author?.name} />
            <div>{thread?.name}</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 mr-1">
              {thread?.labels
                ?.filter((tl) => tl.enabled && !!tl.label?.enabled)
                .map((threadLabel) => (
                  <LabelBadge
                    key={threadLabel.label.id}
                    name={threadLabel.label.name}
                    color={threadLabel.label.color}
                  />
                ))}
            </div>
            {thread?.assignedUserId ? (
              <Avatar
                variant="user"
                size="md"
                fallback={thread.assignedUser?.name}
              />
            ) : (
              <CircleUser className="size-4" />
            )}
            <PriorityIndicator priority={thread?.priority ?? 0} />
            <StatusIndicator status={thread?.status ?? 0} />
          </div>
        </div>
      </Link>

      {/* TODO add link directly to the message */}
      <Link to="/app/threads/$id" params={{ id: thread.id }} className="w-full">
        <Card className="relative before:w-px before:h-4 before:left-4 before:absolute before:-top-4 not-first:before:bg-border ml-7 group">
          <CardHeader size="sm">
            <CardTitle>
              <Avatar variant="user" size="md" fallback={message.author.name} />
              <p>{message.author.name}</p>
              <p className="text-foreground-secondary">
                {formatRelativeTime(message.createdAt as Date)}
              </p>
              <div className="px-2 py-0.5 bg-foreground-tertiary/20 border border-border-secondary text-xs rounded-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200 group-hover:duration-0">
                Go to message
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RichText content={safeParseJSON(message.content)} />
          </CardContent>
        </Card>
      </Link>
      <div className="absolute left-1.75 top-8 w-4 h-7.5 border-b-2 border-l-2 rounded-bl-xl" />
    </div>
  );
};

const searchParams = {
  q: parseAsString.withDefault(""),
};

export const Route = createFileRoute("/app/_workspace/_main/search/")({
  component: RouteComponent,
  validateSearch: createStandardSchemaV1(searchParams, {
    partialOutput: true,
  }),
});

function RouteComponent() {
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [searchQuery, setSearchQuery] = useQueryState(
    "q",
    parseAsString.withDefault(""),
  );
  const currentOrg = useAtomValue(activeOrganizationAtom);

  type SearchHit = {
    document?: {
      id?: string;
    };
  };
  type SearchResponse = {
    hits?: SearchHit[];
  };

  const {
    data: messageIds = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["message-search", currentOrg?.id, submittedQuery],
    queryFn: async () => {
      if (!currentOrg || !submittedQuery.trim()) {
        return [];
      }

      const searchResponse = await fetchClient.mutate.message.search({
        query: submittedQuery,
        organizationId: currentOrg.id,
      });

      const hits = (searchResponse as SearchResponse)?.hits || [];
      const ids = hits
        .map((hit: SearchHit) => hit.document?.id)
        .filter((id): id is string => Boolean(id));

      return ids;
    },
    enabled: Boolean(currentOrg && submittedQuery.trim()),
  });

  const handleSearch = () => {
    if (!currentOrg || !searchQuery.trim()) return;
    setSubmittedQuery(searchQuery.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  useEffect(() => {
    if (searchQuery.trim()) {
      setSubmittedQuery(searchQuery.trim());
      handleSearch();
    }
  }, []);

  return (
    <>
      <CardHeader className="flex items-center gap-2">
        <Search className="size-4" />
        <Input
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) =>
            setSearchQuery(e.target.value, {
              limitUrlUpdates:
                e.target.value === "" ? undefined : debounce(750),
            })
          }
          className="flex-1"
          aria-label="Search input"
          variant="borderless"
          onKeyDown={handleKeyDown}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading && (
          <div className="text-center text-muted-foreground py-8">
            Searching...
          </div>
        )}
        {error && (
          <div className="text-center text-destructive py-8">
            An error occurred while searching
          </div>
        )}
        {!isLoading && !error && messageIds.length === 0 && submittedQuery && (
          <div className="text-center text-muted-foreground py-8">
            No results found
          </div>
        )}
        {!isLoading && !error && submittedQuery && messageIds.length > 0 && (
          <div className="flex flex-col gap-6">
            {messageIds.map((id) => (
              <SearchResultItem key={id} messageId={id} />
            ))}
          </div>
        )}
      </CardContent>
    </>
  );
}
