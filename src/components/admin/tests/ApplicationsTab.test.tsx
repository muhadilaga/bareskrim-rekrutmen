import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// ── Re-renderable state mock ────────────────────────────────────────────────
// useState menyimpan nilai persisten antar-render; setter memperbarui store.
// render() memanggil ulang komponen sehingga efek & UI ikut ter-update —
// memungkinkan assertion untuk disabled-while-busy dan reload pasca-mutation.
const h = vi.hoisted(() => ({
  values: [] as unknown[],
  setters: [] as Array<(v: any) => void>,
  toast: { success: vi.fn(), error: vi.fn() },
  reset() {
    this.values = [];
    this.setters = [];
  },
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial?: unknown) => {
      const i = h.setters.length;
      if (h.values[i] === undefined) {
        h.values[i] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      }
      const set = (v: unknown) => {
        h.values[i] = typeof v === "function" ? (v as (prev: unknown) => unknown)(h.values[i]) : v;
      };
      h.setters[i] = set;
      return [h.values[i], set];
    },
    // Efek dijalankan langsung (sinkron) agar load() terpicu like browser.
    useEffect: (fn: () => void) => {
      fn();
    },
    useMemo: (fn: () => unknown) => fn(),
    useCallback: <T,>(fn: T) => fn,
    useRef: <T,>(v: T) => ({ current: v }),
  };
});

vi.mock("@/components/ui/Toast", () => ({ useToastContext: () => h.toast }));

import { ApplicationsTab } from "../ApplicationsTab";

// ── Helpers ─────────────────────────────────────────────────────────────────
const HEADERS = { "Content-Type": "application/json", "x-admin-key": "test-key" };

function row(over: Record<string, unknown> = {}) {
  return {
    id: "app-1",
    registrationId: "XLI-02-ABC123",
    status: "MENUNGGU_VERIFIKASI",
    fullName: "Budi Santoso",
    robloxUsername: "budisan",
    userId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    recruitmentPeriod: { code: "XLI-02", name: "Gelombang 2" },
    user: null,
    ...over,
  };
}

function res(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as any;
}

const getApplications = () => res({ ok: true, applications: [row()] });
const postOk = () => res({ ok: true, message: "Status berubah menjadi DITERIMA" });

const confirmMock = vi.fn((_msg: string): boolean => true);
const fetchRouter = vi.fn(async (_url: string, init?: any) => {
  const method = init?.method ?? "GET";
  if (method === "GET") return getApplications();
  if (method === "POST") return postOk();
  return res({ ok: false, message: `unexpected ${method}` }, false, 404);
});

function render() {
  h.setters = [];
  return ApplicationsTab({ headers: HEADERS });
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
    if (el.type !== "button") return false;
    const kids = el.props?.children;
    const flat = Array.isArray(kids) ? kids : [kids];
    // Match eksak: "Terima" tidak boleh cocok dengan "Terima Kembali".
    return flat.some((k: unknown) => typeof k === "string" && k === text);
  })[0];
}

function badgeByText(tree: unknown, text: string) {
  return findAll(tree, (el) => {
    const kids = el.props?.children;
    const flat = Array.isArray(kids) ? kids : [kids];
    return flat.some((k: unknown) => typeof k === "string" && k === text);
  })[0];
}

function postCalls() {
  return fetchRouter.mock.calls.filter(([, init]) => (init?.method ?? "GET") === "POST");
}

function getCalls() {
  return fetchRouter.mock.calls.filter(([, init]) => (init?.method ?? "GET") === "GET");
}

beforeEach(() => {
  vi.clearAllMocks();
  h.reset();
  // State awal: rows terisi + loaded=true (mock tidak re-render otomatis setelah
  // load(), jadi tes yang butuh row tertentu harus pre-populate h.values).
  h.values = [[row()], true, null, null, ""];
  confirmMock.mockReturnValue(true);
  fetchRouter.mockImplementation(async (_url: string, init?: any) => {
    const method = init?.method ?? "GET";
    if (method === "GET") return getApplications();
    if (method === "POST") return postOk();
    return res({ ok: false, message: `unexpected ${method}` }, false, 404);
  });
  vi.stubGlobal("fetch", fetchRouter);
  vi.stubGlobal("confirm", confirmMock);
});

afterEach(() => vi.unstubAllGlobals());

// ── Tests ────────────────────────────────────────────────────────────────────
describe("ApplicationsTab — status labels (TASK 03L.2E.4.1D)", () => {
  it("1. MENUNGGU_VERIFIKASI -> label 'Menunggu Verifikasi' (bukan LULUS/TIDAK_LULUS)", () => {
    render();
    expect(badgeByText(render(), "Menunggu Verifikasi")).toBeTruthy();
    expect(badgeByText(render(), "LULUS")).toBeFalsy();
    expect(badgeByText(render(), "TIDAK LULUS")).toBeFalsy();
  });

  it("2. DITERIMA -> label 'Diterima'", () => {
    h.values = [[row({ status: "DITERIMA", userId: "u1", user: { id: "u1", username: "budisan" } })], true, null, null, ""];
    const tree = render();
    expect(badgeByText(tree, "Diterima")).toBeTruthy();
    expect(badgeByText(tree, "LULUS")).toBeFalsy();
  });

  it("3. DITOLAK -> label 'Ditolak'", () => {
    h.values = [[row({ status: "DITOLAK" })], true, null, null, ""];
    const tree = render();
    expect(badgeByText(tree, "Ditolak")).toBeTruthy();
    expect(badgeByText(tree, "TIDAK LULUS")).toBeFalsy();
  });
});

describe("ApplicationsTab — aksi per status", () => {
  it("4. Pending: tombol Terima dan Tolak tampil", () => {
    const tree = render();
    expect(buttonByText(tree, "Terima")).toBeTruthy();
    expect(buttonByText(tree, "Tolak")).toBeTruthy();
    expect(buttonByText(tree, "Cabut Penerimaan")).toBeFalsy();
    expect(buttonByText(tree, "Terima Kembali")).toBeFalsy();
  });

  it("5. DITERIMA: tombol 'Cabut Penerimaan' tampil (bukan Terima/Tolak)", () => {
    h.values = [[row({ status: "DITERIMA" })], true, null, null, ""];
    const tree = render();
    expect(buttonByText(tree, "Cabut Penerimaan")).toBeTruthy();
    expect(buttonByText(tree, "Terima")).toBeFalsy();
    expect(buttonByText(tree, "Tolak")).toBeFalsy();
  });

  it("6. DITOLAK: tombol 'Terima Kembali' tampil", () => {
    h.values = [[row({ status: "DITOLAK" })], true, null, null, ""];
    const tree = render();
    expect(buttonByText(tree, "Terima Kembali")).toBeTruthy();
    expect(buttonByText(tree, "Terima")).toBeFalsy();
    expect(buttonByText(tree, "Tolak")).toBeFalsy();
  });

  it("7. Soft-deleted: tidak ada tombol aksi", () => {
    h.values = [[row({ deletedAt: "2026-01-02T00:00:00.000Z" })], true, null, null, ""];
    const tree = render();
    expect(badgeByText(tree, "Dihapus")).toBeTruthy();
    expect(buttonByText(tree, "Terima")).toBeFalsy();
    expect(buttonByText(tree, "Tolak")).toBeFalsy();
  });
});

describe("ApplicationsTab — mutation flow", () => {
  it("8. Tidak ada mutation saat render/mount (hanya GET)", () => {
    render();
    expect(postCalls().length).toBe(0);
    expect(getCalls().length).toBeGreaterThan(0);
  });

  it("9. Klik Terima -> confirm -> POST status DITERIMA -> toast success + reload", async () => {
    const tree = render();
    await buttonByText(tree, "Terima").props.onClick();

    expect(confirmMock).toHaveBeenCalledTimes(1);
    const confirmMsg = confirmMock.mock.calls[0][0] as string;
    expect(confirmMsg).toContain("Terima");
    expect(confirmMsg).toContain("Budi Santoso");

    const posts = postCalls();
    expect(posts.length).toBe(1);
    expect(JSON.parse(posts[0][1].body)).toEqual({ applicationId: "app-1", status: "DITERIMA" });
    expect(posts[0][1].method).toBe("POST");

    expect(h.toast.success).toHaveBeenCalledTimes(1);
    expect(h.toast.error).not.toHaveBeenCalled();
    // Sukses -> reload (GET tambahan setelah POST)
    expect(getCalls().length).toBeGreaterThan(1);
  });

  it("10. Klik Tolak -> POST status DITOLAK", async () => {
    const tree = render();
    await buttonByText(tree, "Tolak").props.onClick();

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(postCalls()[0][1].body)).toEqual({ applicationId: "app-1", status: "DITOLAK" });
  });

  it("11. Cabut Penerimaan (DITERIMA) -> POST status DITOLAK", async () => {
    h.values = [[row({ status: "DITERIMA" })], true, null, null, ""];
    const tree = render();
    await buttonByText(tree, "Cabut Penerimaan").props.onClick();

    expect(JSON.parse(postCalls()[0][1].body)).toEqual({ applicationId: "app-1", status: "DITOLAK" });
  });

  it("12. Terima Kembali (DITOLAK) -> POST status DITERIMA", async () => {
    h.values = [[row({ status: "DITOLAK" })], true, null, null, ""];
    const tree = render();
    await buttonByText(tree, "Terima Kembali").props.onClick();

    expect(JSON.parse(postCalls()[0][1].body)).toEqual({ applicationId: "app-1", status: "DITERIMA" });
  });

  it("13. Confirm dibatalkan -> tidak ada POST", async () => {
    confirmMock.mockReturnValue(false);
    const tree = render();
    await buttonByText(tree, "Terima").props.onClick();

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(postCalls().length).toBe(0);
    expect(h.toast.success).not.toHaveBeenCalled();
  });

  it("14. Error backend -> toast.error + pesan error dirender", async () => {
    h.values = [[row()], true, null, null, ""];
    fetchRouter.mockImplementation(async (_url: string, init?: any) => {
      if ((init?.method ?? "GET") === "GET") return getApplications();
      return res({ ok: false, message: "Application has been soft-deleted" }, false, 400);
    });
    const tree = render();
    await buttonByText(tree, "Terima").props.onClick();

    expect(h.toast.error).toHaveBeenCalledTimes(1);
    expect(postCalls().length).toBe(1);
    // Pesan error tampil di UI (state msg)
    expect(h.toast.error.mock.calls[0][0]).toContain("soft-deleted");
  });

  it("15. Idempotent same-state (unchanged:true) -> toast info + tanpa reload", async () => {
    // Simulasi dua admin klik Terima bersamaan: respons POST = unchanged.
    h.values = [[row()], true, null, null, ""];
    fetchRouter.mockImplementation(async (_url: string, init?: any) => {
      if ((init?.method ?? "GET") === "GET") return getApplications();
      return res({ ok: true, unchanged: true, message: "Status sudah DITERIMA. Tidak ada perubahan." });
    });
    const tree = render();
    expect(getCalls().length).toBe(1); // GET awal dari effect
    await buttonByText(tree, "Terima").props.onClick();

    expect(postCalls().length).toBe(1);
    expect(h.toast.success).toHaveBeenCalledTimes(1);
    expect(h.toast.success.mock.calls[0][0]).toContain("Tidak ada perubahan");
    // unchanged -> handler TIDAK memanggil load(): tidak ada GET tambahan.
    expect(getCalls().length).toBe(1);
  });

  it("16. Pencegahan submission ganda: tombol hilang & 'Memproses...' saat POST pending", async () => {
    let resolvePost: (v: any) => void = () => {};
    fetchRouter.mockImplementation(async (_url: string, init?: any) => {
      if ((init?.method ?? "GET") === "GET") return getApplications();
      return new Promise((resolve) => {
        resolvePost = resolve;
      });
    });
    const tree = render();
    expect(buttonByText(tree, "Terima")).toBeTruthy();

    const pending = buttonByText(tree, "Terima").props.onClick(); // belum di-await
    await new Promise((r) => setTimeout(r, 0)); // biarkan handler jalan ke await fetch

    // Re-render: busyId ter-set -> tombol diganti indikator Memproses...
    const busyTree = render();
    expect(buttonByText(busyTree, "Terima")).toBeFalsy();
    expect(badgeByText(busyTree, "Memproses...")).toBeTruthy();

    resolvePost(postOk());
    await pending;

    // Setelah selesai, tombol kembali
    const doneTree = render();
    expect(buttonByText(doneTree, "Terima")).toBeTruthy();
  });

  it("17. Loading state: skeleton sebelum loaded", () => {
    // loaded=false -> skeleton dirender. Skeleton adalah function component,
    // jadi di tree ia muncul sebagai element descriptor (type function tak
    // ter-serialisasi) dengan props.className khas "h-4 w-1/3".
    fetchRouter.mockImplementation(async (_url: string, init?: any) => {
      if ((init?.method ?? "GET") === "GET") return new Promise(() => {}); // tidak pernah resolve
      return postOk();
    });
    h.values = [null, false, null, null, ""]; // rows=null, loaded=false
    const tree = render();
    expect(buttonByText(tree, "Terima")).toBeFalsy();
    const skeletons = findAll(tree, (el) => typeof el.props?.className === "string" && el.props.className.includes("h-4 w-1/3"));
    expect(skeletons.length).toBe(1);
  });

  it("18. Empty state: pesan saat tidak ada pendaftaran", () => {
    h.values = [[], true, null, null, ""]; // rows kosong, loaded=true
    const tree = render();
    expect(buttonByText(tree, "Terima")).toBeFalsy();
    expect(JSON.stringify(tree).includes("Belum ada pendaftaran")).toBe(true);
  });
});
