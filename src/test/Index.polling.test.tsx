import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import Index from "@/pages/Index";

// Hoist mocks so they're available in vi.mock factory functions
const { mockGetSession, mockOnAuthStateChange, mockStorageUpload, mockFrom, mockToast } =
  vi.hoisted(() => ({
    mockGetSession: vi.fn(),
    mockOnAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    })),
    mockStorageUpload: vi.fn(),
    mockFrom: vi.fn(),
    mockToast: vi.fn(),
  }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
      signOut: vi.fn(),
    },
    storage: {
      from: () => ({ upload: mockStorageUpload }),
    },
    from: mockFrom,
  },
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Stub framer-motion so AnimatePresence doesn't block state transitions
vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, prop) => {
        const Tag = prop as string;
        return ({ children, ...props }: any) => {
          const { initial, animate, exit, transition, ...rest } = props;
          return <div {...rest}>{children}</div>;
        };
      },
    }
  ),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock("@/components/Header", () => ({ Header: () => <div>Header</div> }));
vi.mock("@/components/AuthForm", () => ({
  AuthForm: ({ onAuthSuccess }: { onAuthSuccess: () => void }) => (
    <button onClick={onAuthSuccess}>Auth</button>
  ),
}));
vi.mock("@/components/DocumentUpload", () => ({
  DocumentUpload: ({ onFileSelect, selectedFile, onClear }: any) => (
    <div>
      <button onClick={() => onFileSelect(new File(["content"], "test.txt"))}>Upload</button>
      {selectedFile && <button onClick={onClear}>Clear</button>}
    </div>
  ),
}));
vi.mock("@/components/VoiceSettings", () => ({
  VoiceSettings: () => <div>VoiceSettings</div>,
}));
vi.mock("@/components/ConversionProgress", () => ({
  ConversionProgress: ({ stage }: any) => (
    <div data-testid="converting">Converting: {stage}</div>
  ),
}));
vi.mock("@/components/AudioPlayer", () => ({
  AudioPlayer: () => <div>AudioPlayer</div>,
}));

const authenticatedSession = {
  session: {
    access_token: "test-token",
    user: { id: "user-123" },
  },
};

function setupFetch(conversionId = "conv-abc") {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: conversionId, status: "converting" }),
    })
  );
}

/** Advance timers by ms and flush all pending promises. */
async function tickMs(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

async function navigateToConvert() {
  await act(async () => {
    fireEvent.click(screen.getByText("Upload"));
  });
  await act(async () => {
    fireEvent.click(screen.getByText("Convert to Audiobook"));
  });
}

describe("Index polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockGetSession.mockResolvedValue({ data: authenticatedSession });
    mockStorageUpload.mockResolvedValue({ error: null });
    vi.stubGlobal("crypto", { randomUUID: () => "uuid-123" });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("shows error and exits converting state after MAX_POLLS without completion", async () => {
    setupFetch();
    const mockSingle = vi.fn().mockResolvedValue({
      data: { status: "converting", progress: 50, audio_storage_path: null, total_duration_seconds: null, chapters: null },
      error: null,
    });
    mockFrom.mockReturnValue({ select: () => ({ eq: () => ({ single: mockSingle }) }) });

    render(<Index />);
    await navigateToConvert();

    // Advance past MAX_POLLS (100 polls × 3000ms = 300_000ms)
    await tickMs(310_000);

    expect(screen.queryByTestId("converting")).toBeNull();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Conversion timed out" })
    );
  });

  it("transitions to done state when conversion reaches done", async () => {
    setupFetch();
    const mockSingle = vi.fn()
      .mockResolvedValueOnce({
        data: { status: "converting", progress: 50, audio_storage_path: null, total_duration_seconds: null, chapters: null },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { status: "done", progress: 100, audio_storage_path: "path/file.mp3", total_duration_seconds: 60, chapters: [] },
        error: null,
      });
    mockFrom.mockReturnValue({ select: () => ({ eq: () => ({ single: mockSingle }) }) });

    render(<Index />);
    await navigateToConvert();

    // Tick poll 1 (3 000 ms)
    await tickMs(3000);
    // Tick poll 2 (3 000 ms) — returns "done"
    await tickMs(3000);
    // Flush the 500 ms setTimeout that transitions to "done" state
    await tickMs(600);
    // Flush any remaining React state updates
    await act(async () => {});

    expect(screen.getByText("AudioPlayer")).toBeInTheDocument();
  });

  it("shows connection error and exits converting state after consecutive poll errors", async () => {
    setupFetch();
    const mockSingle = vi.fn().mockResolvedValue({ data: null, error: new Error("DB error") });
    mockFrom.mockReturnValue({ select: () => ({ eq: () => ({ single: mockSingle }) }) });

    render(<Index />);
    await navigateToConvert();

    // Advance 5 poll cycles (MAX_CONSECUTIVE_ERRORS = 5) × 3000ms
    await tickMs(16_000);

    expect(screen.queryByTestId("converting")).toBeNull();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Connection error" })
    );
  });
});
