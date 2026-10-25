export interface OverlayComment {
  id: string;
  organization_id: string;
  user_id: string;
  author_name: string;
  body: string;
  created_at: string;
}

export interface VisionAnswer {
  answer: string;
}

export interface VisionExchange {
  id: string;
  question: string;
  answer: string;
}

export interface CaptureRect {
  left: number;
  top: number;
  width: number;
  height: number;
}
