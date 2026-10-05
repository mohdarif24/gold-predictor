import { secured } from "@/lib/http";
import { getNews } from "@/lib/queries";

export const GET = secured(({ run }) => getNews(run));
