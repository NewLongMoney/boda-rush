import { createFileRoute } from "@tanstack/react-router";
import { BodaGame } from "@/components/BodaGame";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <BodaGame />;
}
