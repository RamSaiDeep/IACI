import type { Metadata } from "next";
import Header from "../../components/Header";
import AskClient from "../../components/ask/AskClient";

export const metadata: Metadata = {
  title: "Ask the Index — Actuaries Climate Index",
  description:
    "Ask plain-language questions about climate extremes and get a cited report built only from the index's own values.",
};

export default function AskPage() {
  return (
    <div className="flex-1 flex flex-col font-sans">
      <Header portal="global" />
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <AskClient />
      </main>
    </div>
  );
}
