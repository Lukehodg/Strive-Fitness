import { QueryClientProvider } from "@tanstack/react-query";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import Dashboard from "@/pages/dashboard";
import NotFound from "@/pages/not-found";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route component={NotFound} />
      </Switch>
      <Toaster />
    </QueryClientProvider>
  );
}
