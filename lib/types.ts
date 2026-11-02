// Shapes of JSON returned by our API routes, shared by server and browser code.

export type PaperStatus = "pending" | "approved" | "rejected";
export type VenueType = "journal" | "conference" | "preprint" | "book" | "other";
export type ReadingStatus = "to_read" | "reading" | "read";

export interface AuthorRef {
  author_id: number;
  full_name: string;
  author_order: number;
}

/** A paper as listed in search results and on profile pages. */
export interface PaperSummary {
  paper_id: number;
  title: string;
  publication_year: number;
  status: PaperStatus;
  domain_id: number;
  domain_name: string;
  venue_name: string | null;
  venue_type: VenueType | null;
  author_names: string;
  keywords: string[];
  citation_count: number;
  external_citation_count: number;
  snippet?: string | null;
  score?: number | null;
}

export interface PaperDetail extends PaperSummary {
  abstract: string | null;
  doi: string | null;
  has_pdf: boolean;
  pdf_size_bytes: number | null;
  uploaded_by: number | null;
  parent_domain_name: string | null;
  venue_id: number | null;
  authors: AuthorRef[];
  created_at: string;
  updated_at: string;
}

export interface PaperLink {
  paper_id: number;
  title: string;
  publication_year: number;
  author_names: string;
}

export interface PaperPageData {
  paper: PaperDetail;
  references: PaperLink[];
  citedBy: PaperLink[];
  canDelete: boolean;
}

export interface Domain {
  domain_id: number;
  name: string;
  description: string | null;
  parent_domain_id: number | null;
  paper_count: number;
}

export interface Venue {
  venue_id: number;
  name: string;
  venue_type: VenueType;
}

export interface MetaData {
  domains: Domain[];
  venues: Venue[];
  totals: { papers: number; authors: number; citations: number; domains: number };
}

export interface SearchResponse {
  results: PaperSummary[];
  total: number;
  page: number;
  pageSize: number;
  mode: string;
}

export interface MyPaper {
  paper_id: number;
  title: string;
  publication_year: number;
  status: PaperStatus;
  domain_name: string;
  created_at: string;
  last_reason: string | null;
}
