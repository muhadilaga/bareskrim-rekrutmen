import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// ── State queue: AdminPanel memanggil useState 30 kali secara berurutan ──────
const h = vi.hoisted(() => ({
  values: [] as unknown[],
  setters: [] as Array<ReturnType<typeof vi.fn>>,
  idx: 0,
  toast: { success: vi.fn(), error: vi.fn() },
  reset(values: unknown[]) {
    this.idx = 0;
    this.setters = [];
    this.values = values;
  },
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial?: unknown) => {
      const i = h.idx++;
      const val =
        i < h.values.length
          ? h.values[i]
          : typeof initial === "function"
            ? (initial as () => unknown)()
            : initial;
      const set = vi.fn();
      h.setters[i] = set;
      return [val, set];
    },
    useEffect: () => {},
    useMemo: (fn: () => unknown) => fn(),
    useCallback: <T,>(fn: T) => fn,
    useRef: <T,>(v: T) => ({ current: v }),
  };
});

vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/ui/Toast", () => ({ useToastContext: () => h.toast }));

import { AdminPanel } from "../AdminPanel";

// ── Helpers ──────────────────────────────────────────────────────────────────
const IDX = {
  key: 0, showKey: 1, staff: 2, verifiedAdmin: 3, authStep: 4, authBusy: 5,
  authed: 6, periods: 7, questions: 8, busy: 9, msg: 10, dbReady: 11, tab: 12,
  stats: 13, logs: 14, diagnostics: 15, retryQueue: 16,
  periodName: 17, periodMcq: 18, periodEssay: 19, recruitmentPeriods: 20,
  selectedRecruitmentPeriodId: 21, createAsDraft: 22, editingDates: 23,
} as const;

function queue(overrides: Partial<Record<number, unknown>> = {}) {
  const base: unknown[] = [
    "", false, "", null, "key", false,
    true, [], [], false, null, true, "periode",
    null, [], null, null,
    "", "", "",
    [{ id: "rec-1", code: "XLI-01", name: "Gel 1", isActive: true }],
    "", false, null,
    "MCQ", "", ["", "", "", ""], 0, "", 4,
  ];
  for (const [k, v] of Object.entries(overrides)) base[Number(k)] = v;
  h.reset(base);
}

function periodFixture(over: Record<string, unknown> = {}) {
  return {
    id: "exam-1", name: "Periode Ujian 1", description: "",
    recruitmentPeriodId: null, recruitmentPeriod: null,
    isActive: true, isAttendanceOpen: false, isExamOpen: false,
    seed: 12345, mcqCount: 15, essayCount: 5, passThreshold: 70,
    openedAt: "2026-01-01T00:00:00.000Z", closedAt: null,
    examStartTime: null, examEndTime: null,
    _count: { attempts: 0, attendances: 0 }, attempts: [], attendances: [],
    ...over,
  };
}

function mappedPeriod(over: Record<string, unknown> = {}) {
  return periodFixture({
    recruitmentPeriodId: "rec-1",
    recruitmentPeriod: { id: "rec-1", code: "XLI-01", name: "Gel 1", deletedAt: null },
    ...over,
  });
}

function findAll(node: unknown, pred: (el: any) => boolean, acc: any[] = []): any[] {
  if (!node || typeof node !== "object") return acc;
  if (Array.isArray(node)) {
    for (const c of node) findAll(c, pred, acc);
    return acc;
  }
  const el = node as any;
  if (el.props) {
    if (pred(el)) acc.push(el);
    if (el.props.children) findAll(el.props.children, pred, acc);
  }
  return acc;
}

function buttonByText(tree: unknown, text: string) {
  return findAll(tree, (el) => {
    const kids = el.props?.children;
    const flat = Array.isArray(kids) ? kids : [kids];
    return flat.some((k: unknown) => typeof k === "string" && k.includes(text));
  })[0];
}

function res(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as any;
}

const periodGet = () => res({ ok: true, periods: [], recruitmentPeriods: [] });
const fetchRouter = vi.fn(async (url: string, init?: any) => {
  const method = init?.method ?? "GET";
  if (url === "/api/admin/period" && method === "GET") return periodGet();
  if (url === "/api/admin/questions") return res({ ok: true, questions: [] });
  if (url === "/api/admin/init") return res({ ok: true, initialized: true });
  if (url === "/api/admin/stats") return res({ ok: true, stats: null });
  return res({ ok: false, message: `unexpected ${method} ${url}` }, false, 404);
});
const confirmMock = vi.fn((..._args: unknown[]): boolean => true);

beforeEach(() => {
  vi.clearAllMocks();
  confirmMock.mockReturnValue(true);
  vi.stubGlobal("fetch", fetchRouter);
  vi.stubGlobal("confirm", confirmMock);
  queue();
});
afterEach(() => vi.unstubAllGlobals());

const calls = (method: string) =>
  fetchRouter.mock.calls.filter(([, init]) => (init?.method ?? "GET") === method);

// ── Tests ────────────────────────────────────────────────────────────────────
describe("AdminPanel component", () => {
  it("1. RecruitmentPeriod tidak auto-selected (select value kosong)", () => {
    const tree = AdminPanel();
    const select = findAll(tree, (el) => el.type === "select")[0];
    expect(select).toBeTruthy();
    expect(select.props.value).toBe("");
    const opts = findAll(select, (el) => el.type === "option");
    expect(opts[0].props.value).toBe("");
    expect(String(opts[0].props.children)).toContain("Belum Dipetakan");
  });

  it("2. unmapped create -> draft (draftMode:true, recruitmentPeriodId:null)", async () => {
    queue({ [IDX.periodName]: "Draft Baru", [IDX.selectedRecruitmentPeriodId]: "" });
    fetchRouter.mockImplementationOnce(async () => res({ ok: true, message: "Draft periode berhasil dibuat." }));
    const tree = AdminPanel();
    const btn = buttonByText(tree, "Buka Periode Baru");
    expect(btn).toBeTruthy();
    await btn.props.onClick();
    const post = calls("POST")[0];
    expect(post).toBeTruthy();
    const body = JSON.parse(post[1].body);
    expect(body.draftMode).toBe(true);
    expect(body.recruitmentPeriodId).toBeNull();
    expect(body.name).toBe("Draft Baru");
  });

  it("3. existing mapping prefilled pada edit (recruitmentPeriodId masuk editingDates)", () => {
    queue({ [IDX.periods]: [mappedPeriod()] });
    const tree = AdminPanel();
    const btn = buttonByText(tree, "Edit Periode");
    expect(btn).toBeTruthy();
    btn.props.onClick();
    expect(h.setters[IDX.editingDates]).toHaveBeenCalledTimes(1);
    const updater = h.setters[IDX.editingDates].mock.calls[0][0] as (cur: null) => any;
    const val = updater(null);
    expect(val.id).toBe("exam-1");
    expect(val.recruitmentPeriodId).toBe("rec-1");
  });

  it("4. unmapped exam-open path blocked (400 backend, tanpa reload sukses)", async () => {
    queue({ [IDX.periods]: [periodFixture({ isActive: true })] });
    const errMsg = "Akses ujian tidak dapat dibuka karena periode belum terhubung dengan Periode Pendaftaran yang valid.";
    fetchRouter.mockImplementationOnce(async () => res({ ok: false, message: errMsg }, false, 400));
    const tree = AdminPanel();
    const btn = buttonByText(tree, "Buka Ujian");
    expect(btn).toBeTruthy();
    await btn.props.onClick();
    const patch = calls("PATCH")[0];
    expect(JSON.parse(patch[1].body)).toMatchObject({
      periodId: "exam-1", action: "toggleExamOpen", isExamOpen: true,
    });
    expect(h.setters[IDX.msg]).toHaveBeenCalledWith({ ok: false, text: errMsg });
    // Tidak ada reload sukses setelah ditolak
    const gets = fetchRouter.mock.calls.filter(([u, i]) => u === "/api/admin/period" && (i?.method ?? "GET") === "GET");
    expect(gets.length).toBe(0);
  });

  it("5. unmapped attendance-open path blocked (400 backend, tanpa reload sukses)", async () => {
    queue({ [IDX.periods]: [periodFixture({ isActive: true })] });
    const errMsg = "Akses absen tidak dapat dibuka karena periode belum terhubung dengan Periode Pendaftaran yang valid.";
    fetchRouter.mockImplementationOnce(async () => res({ ok: false, message: errMsg }, false, 400));
    const tree = AdminPanel();
    const btn = buttonByText(tree, "Buka Absen");
    expect(btn).toBeTruthy();
    await btn.props.onClick();
    const patch = calls("PATCH")[0];
    expect(JSON.parse(patch[1].body)).toMatchObject({
      periodId: "exam-1", action: "toggleAttendanceOpen", isAttendanceOpen: true,
    });
    expect(h.setters[IDX.msg]).toHaveBeenCalledWith({ ok: false, text: errMsg });
    const gets = fetchRouter.mock.calls.filter(([u, i]) => u === "/api/admin/period" && (i?.method ?? "GET") === "GET");
    expect(gets.length).toBe(0);
  });

  it("6. backend mapping error dirender (setMsg menerima teks error backend)", async () => {
    queue({ [IDX.periods]: [periodFixture({ isActive: true })] });
    const errMsg = "Akses ujian tidak dapat dibuka karena periode belum terhubung dengan Periode Pendaftaran yang valid.";
    fetchRouter.mockImplementationOnce(async () => res({ ok: false, message: errMsg }, false, 400));
    const tree = AdminPanel();
    await buttonByText(tree, "Buka Ujian").props.onClick();
    // Banner msg dirender dari state msg: assert setter memuat {ok:false, text: pesan backend}
    expect(h.setters[IDX.msg]).toHaveBeenCalledWith({ ok: false, text: errMsg });
    expect(h.toast.error).not.toHaveBeenCalled();
  });

  it("7. reset menampilkan explicit confirmation (ExamAttempt & ExamResult)", async () => {
    queue({ [IDX.periods]: [periodFixture()] });
    const tree = AdminPanel();
    await buttonByText(tree, "Reset Ujian").props.onClick();
    expect(confirmMock).toHaveBeenCalledTimes(1);
    const msg = confirmMock.mock.calls[0][0] as string;
    expect(msg).toContain("ExamAttempt");
    expect(msg).toContain("ExamResult");
    expect(msg).toContain("PERMANEN");
  });

  it("8. cancel reset -> tidak ada request reset", async () => {
    queue({ [IDX.periods]: [periodFixture()] });
    confirmMock.mockReturnValue(false);
    const tree = AdminPanel();
    await buttonByText(tree, "Reset Ujian").props.onClick();
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(fetchRouter).not.toHaveBeenCalled();
    expect(h.setters[IDX.msg]).not.toHaveBeenCalled();
  });

  it("9. confirm reset -> payload action:'reset' + confirmReset:true", async () => {
    queue({ [IDX.periods]: [periodFixture({ id: "exam-r" })] });
    fetchRouter.mockImplementationOnce(async () => res({ ok: true, message: "Reset berhasil. 0 attempt, 0 hasil dihapus." }));
    const tree = AdminPanel();
    await buttonByText(tree, "Reset Ujian").props.onClick();
    const patch = calls("PATCH")[0];
    expect(patch).toBeTruthy();
    const body = JSON.parse(patch[1].body);
    expect(body.action).toBe("reset");
    expect(body.confirmReset).toBe(true);
    expect(body.periodId).toBe("exam-r");
    expect(h.toast.success).toHaveBeenCalled();
  });

  it("10. mapped period workflow tetap berjalan (toggleExamOpen sukses + reload)", async () => {
    queue({ [IDX.periods]: [mappedPeriod({ id: "exam-m", isActive: true, isExamOpen: false })] });
    fetchRouter.mockImplementationOnce(async () => res({ ok: true, message: "Akses ujian dibuka." }));
    const tree = AdminPanel();
    await buttonByText(tree, "Buka Ujian").props.onClick();
    const patch = calls("PATCH")[0];
    expect(JSON.parse(patch[1].body)).toMatchObject({
      periodId: "exam-m", action: "toggleExamOpen", isExamOpen: true,
    });
    // Setelah sukses, load() memanggil GET /api/admin/period
    const gets = fetchRouter.mock.calls.filter(([u, i]) => u === "/api/admin/period" && (i?.method ?? "GET") === "GET");
    expect(gets.length).toBeGreaterThan(0);
    expect(h.setters[IDX.msg]).toHaveBeenCalledWith({ ok: true, text: "Akses ujian dibuka." });
  });
});
