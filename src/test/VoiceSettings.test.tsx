import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { VoiceSettings } from "@/components/VoiceSettings";

// Mock supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "test-token" } },
      }),
    },
  },
}));

// Mock fetch for preview-voice
const mockAudioPlay = vi.fn().mockResolvedValue(undefined);
const mockAudioPause = vi.fn();

class MockAudio {
  onended: (() => void) | null = null;
  play = mockAudioPlay;
  pause = mockAudioPause;
}

vi.stubGlobal("Audio", MockAudio);
vi.stubGlobal("URL", {
  createObjectURL: vi.fn().mockReturnValue("blob:mock"),
  revokeObjectURL: vi.fn(),
});

describe("VoiceSettings", () => {
  const defaultProps = {
    voice: "george",
    speed: 1.0,
    onVoiceChange: vi.fn(),
    onSpeedChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all voice cards", () => {
    render(<VoiceSettings {...defaultProps} />);
    expect(screen.getByText("George")).toBeInTheDocument();
    expect(screen.getByText("Sarah")).toBeInTheDocument();
    expect(screen.getByText("Roger")).toBeInTheDocument();
    expect(screen.getByText("Laura")).toBeInTheDocument();
    expect(screen.getByText("Charlie")).toBeInTheDocument();
    expect(screen.getByText("Liam")).toBeInTheDocument();
  });

  it("renders a preview button for each voice", () => {
    render(<VoiceSettings {...defaultProps} />);
    const previewButtons = screen.getAllByText("Preview");
    expect(previewButtons).toHaveLength(6);
  });

  it("calls onVoiceChange when a voice card is clicked", () => {
    render(<VoiceSettings {...defaultProps} />);
    fireEvent.click(screen.getByText("Sarah").closest("[role='button']")!);
    expect(defaultProps.onVoiceChange).toHaveBeenCalledWith("sarah");
  });

  it("shows loading state while fetching preview audio", async () => {
    // Make fetch hang indefinitely
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(new Promise(() => {}))
    );

    render(<VoiceSettings {...defaultProps} />);
    const georgePreviewBtn = screen.getAllByLabelText(/preview george voice/i)[0];
    fireEvent.click(georgePreviewBtn);

    await waitFor(() => {
      expect(screen.getByText("Loading…")).toBeInTheDocument();
    });
  });

  it("plays audio when preview fetch succeeds", async () => {
    const mockBlob = new Blob(["audio"], { type: "audio/mpeg" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: vi.fn().mockResolvedValue(mockBlob),
      })
    );

    render(<VoiceSettings {...defaultProps} />);
    const georgePreviewBtn = screen.getAllByLabelText(/preview george voice/i)[0];
    fireEvent.click(georgePreviewBtn);

    await waitFor(() => {
      expect(mockAudioPlay).toHaveBeenCalled();
    });
  });
});
