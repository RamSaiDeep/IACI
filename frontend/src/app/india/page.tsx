import type { Metadata } from "next";
import Header from "../../components/Header";
import Hero from "../../components/Hero";

export const metadata: Metadata = {
  title: "Indian Actuaries Climate Index",
  description: "Indian Actuaries Climate Index (IACI) Web Application",
};

export default function IndiaPage() {
  return (
    <div className="flex-1 flex flex-col font-sans">
      <Header />
      <Hero />
    </div>
  );
}
