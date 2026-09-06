import Header from "../components/Header";
import GeneralHero from "../components/GeneralHero";

export default function Home() {
  return (
    <div className="flex-1 flex flex-col font-sans">
      <Header />
      <GeneralHero />
    </div>
  );
}
