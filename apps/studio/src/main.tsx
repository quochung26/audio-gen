import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router";
import "./globals.css";
import { Layout } from "@/components/Layout";
import { Bible } from "@/pages/Bible";
import { Characters } from "@/pages/Characters";
import { Comments } from "@/pages/Comments";
import { Dashboard } from "@/pages/Dashboard";
import { Episode } from "@/pages/Episode";
import { EpisodeAudio } from "@/pages/EpisodeAudio";
import { Facts } from "@/pages/Facts";
import { Job } from "@/pages/Job";
import { NotFound } from "@/pages/NotFound";
import { Prompt } from "@/pages/Prompt";
import { Prompts } from "@/pages/Prompts";
import { Series } from "@/pages/Series";
import { SeriesList } from "@/pages/SeriesList";
import { SeriesNew } from "@/pages/SeriesNew";
import { Tracks } from "@/pages/Tracks";

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      // Studio chạy tại chỗ, dữ liệu đổi do chính bạn hoặc do worker. Lấy lại
      // khi quay lại tab là đủ; không cần polling khắp nơi.
      refetchOnWindowFocus: true,
      staleTime: 2_000,
      retry: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/series" element={<SeriesList />} />
            <Route path="/series/new" element={<SeriesNew />} />
            <Route path="/series/:id" element={<Series />} />
            <Route path="/series/:id/bible" element={<Bible />} />
            <Route path="/series/:id/characters" element={<Characters />} />
            <Route path="/series/:id/facts" element={<Facts />} />
            <Route path="/episode/:id" element={<Episode />} />
            <Route path="/episode/:id/audio" element={<EpisodeAudio />} />
            <Route path="/job/:id" element={<Job />} />
            <Route path="/tracks" element={<Tracks />} />
            <Route path="/binh-luan" element={<Comments />} />
            <Route path="/prompts" element={<Prompts />} />
            <Route path="/prompts/:id" element={<Prompt />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
