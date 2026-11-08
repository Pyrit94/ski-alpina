import { createFileRoute } from "@tanstack/react-router";
import { Werkbank } from "@/components/game/Werkbank";

export const Route = createFileRoute("/werkbank")({
  component: WerkbankPage,
});

function WerkbankPage() {
  return <Werkbank />;
}
