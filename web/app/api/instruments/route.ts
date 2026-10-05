import { secured } from "@/lib/http";
import { listInstruments } from "@/lib/queries";

export const GET = secured(({ run }) => listInstruments(run));
