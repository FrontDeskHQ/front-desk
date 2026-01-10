import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { useAtomValue } from "jotai/react";
import { Search } from "lucide-react";
import { useState } from "react";
import { activeOrganizationAtom } from "~/lib/atoms";
import { fetchClient } from "~/lib/live-state";

export const Route = createFileRoute("/app/_workspace/_main/search/")({
  component: RouteComponent,
});

function RouteComponent() {
  const [searchQuery, setSearchQuery] = useState("");
  const currentOrg = useAtomValue(activeOrganizationAtom);

  const handleSearch = async () => {
    if (!currentOrg || !searchQuery) return;

    const messages = await fetchClient.mutate.message.search({
      query: searchQuery,
      organizationId: currentOrg.id,
    });

    console.log(messages);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-4">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1"
            aria-label="Search input"
          />
          <Button onClick={handleSearch} variant="primary" aria-label="Search">
            <Search className="size-4" />
            Search
          </Button>
        </div>
      </div>
    </div>
  );
}
