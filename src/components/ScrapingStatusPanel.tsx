import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

type ScrapedSite = {
  url: string;
  source: string;
  interest: string;
  status: "success" | "failed" | "pending";
  error?: string;
};

type ScrapingStatusPanelProps = {
  sites: ScrapedSite[];
  isVisible: boolean;
};

export const ScrapingStatusPanel = ({ sites, isVisible }: ScrapingStatusPanelProps) => {
  if (!isVisible || sites.length === 0) return null;

  const successCount = sites.filter(s => s.status === "success").length;
  const failedCount = sites.filter(s => s.status === "failed").length;
  const pendingCount = sites.filter(s => s.status === "pending").length;

  return (
    <Card className="mb-6 border-border/50 bg-gradient-card shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Scraped Sites ({sites.length})</span>
          <div className="flex gap-2">
            <Badge variant="default" className="bg-success">
              <CheckCircle className="h-3 w-3 mr-1" />
              {successCount}
            </Badge>
            <Badge variant="destructive">
              <XCircle className="h-3 w-3 mr-1" />
              {failedCount}
            </Badge>
            {pendingCount > 0 && (
              <Badge variant="secondary">
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                {pendingCount}
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px] pr-4">
          <div className="space-y-2">
            {sites.map((site, index) => (
              <div
                key={index}
                className="flex items-start gap-2 p-2 rounded-md border border-border/50 bg-background/50"
              >
                {site.status === "success" && (
                  <CheckCircle className="h-4 w-4 text-success flex-shrink-0 mt-0.5" />
                )}
                {site.status === "failed" && (
                  <XCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                )}
                {site.status === "pending" && (
                  <Loader2 className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5 animate-spin" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm truncate">{site.source}</span>
                    <Badge variant="outline" className="text-xs">
                      {site.interest}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{site.url}</p>
                  {site.error && (
                    <p className="text-xs text-destructive mt-1">{site.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
