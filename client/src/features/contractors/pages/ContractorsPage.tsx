import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../../api/http";
import { enqueueAction } from "../../../offline/actionQueue";
import { deleteEntity, listEntities, upsertEntities } from "../../../offline/indexedDb";
import { createStableUuid } from "../../../offline/uuid";
import type { ApiListResponse, ApiSingleResponse, Contractor } from "../../../types/api";

function createUuid(): string {
  return createStableUuid();
}

function getFarmId(): string {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return "00000000-0000-0000-0000-000000000000";
    const u = JSON.parse(raw) as { farmId?: string };
    return typeof u.farmId === "string" ? u.farmId : "00000000-0000-0000-0000-000000000000";
  } catch {
    return "00000000-0000-0000-0000-000000000000";
  }
}

function isOfflineLikeError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (err instanceof TypeError) return true;

  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("load failed");
  }

  return false;
}

async function getContractors(): Promise<Contractor[]> {
  try {
    const response = await apiFetch<ApiListResponse<Contractor>>("/contractors");
    await upsertEntities("contractors", response.data as any);
    return response.data;
  } catch (err) {
    const cached = await listEntities<Contractor>("contractors");
    if (cached.length) return cached;
    throw err;
  }
}

type CreateContractorInput = {
  id: string;
  name: string;
  specialty?: string;
  phone?: string;
  email?: string;
  notes?: string;
};

type UpdateContractorInput = {
  name?: string;
  specialty?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
};

async function createContractor(input: CreateContractorInput): Promise<Contractor> {
  try {
    const response = await apiFetch<ApiSingleResponse<Contractor>>("/contractors", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const now = new Date().toISOString();

    const local: Contractor = {
      id: input.id,
      farmId: getFarmId(),
      name: input.name,
      specialty: input.specialty ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await upsertEntities("contractors", [local as any]);

    const actionData: Record<string, unknown> = {
      id: local.id,
      name: local.name,
    };

    if (input.specialty) actionData.specialty = input.specialty;
    if (input.phone) actionData.phone = input.phone;
    if (input.email) actionData.email = input.email;
    if (input.notes) actionData.notes = input.notes;

    await enqueueAction({
      entity: "contractors",
      op: "CREATE",
      data: actionData,
    });

    return local;
  }
}

async function updateContractor(args: { contractorId: string; input: UpdateContractorInput }): Promise<Contractor> {
  try {
    const response = await apiFetch<ApiSingleResponse<Contractor>>(`/contractors/${args.contractorId}`,
      {
        method: "PATCH",
        body: JSON.stringify(args.input),
      },
    );
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const now = new Date().toISOString();
    const cached = await listEntities<Contractor>("contractors");
    const existing = cached.find((c) => c.id === args.contractorId) ?? null;

    const local: Contractor = {
      id: args.contractorId,
      farmId: existing?.farmId ?? getFarmId(),
      name: args.input.name ?? existing?.name ?? "Contractor",
      specialty:
        args.input.specialty !== undefined
          ? args.input.specialty
          : (existing?.specialty ?? null),
      phone: args.input.phone !== undefined ? args.input.phone : (existing?.phone ?? null),
      email: args.input.email !== undefined ? args.input.email : (existing?.email ?? null),
      notes: args.input.notes !== undefined ? args.input.notes : (existing?.notes ?? null),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await upsertEntities("contractors", [local as any]);

    await enqueueAction({
      entity: "contractors",
      op: "UPDATE",
      data: {
        id: local.id,
        ...args.input,
      },
    });

    return local;
  }
}

async function deleteContractor(contractorId: string): Promise<void> {
  try {
    await apiFetch<void>(`/contractors/${contractorId}`, { method: "DELETE" });
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    await deleteEntity("contractors", contractorId);

    await enqueueAction({
      entity: "contractors",
      op: "DELETE",
      data: { id: contractorId },
    });
  }
}

export function ContractorsPage() {
  const qc = useQueryClient();

  const contractorsQuery = useQuery({
    queryKey: ["contractors"],
    queryFn: getContractors,
    staleTime: 30_000,
  });

  const [editing, setEditing] = useState<Contractor | null>(null);

  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  const createMutation = useMutation({
    mutationFn: createContractor,
    onSuccess: async () => {
      setEditing(null);
      setName("");
      setSpecialty("");
      setPhone("");
      setEmail("");
      setNotes("");
      await qc.invalidateQueries({ queryKey: ["contractors"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateContractor,
    onSuccess: async () => {
      setEditing(null);
      setName("");
      setSpecialty("");
      setPhone("");
      setEmail("");
      setNotes("");
      await qc.invalidateQueries({ queryKey: ["contractors"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteContractor,
    onSuccess: async (_data, contractorId) => {
      if (editing?.id === contractorId) {
        setEditing(null);
        setName("");
        setSpecialty("");
        setPhone("");
        setEmail("");
        setNotes("");
      }
      await qc.invalidateQueries({ queryKey: ["contractors"] });
    },
  });

  const contractorsSorted = useMemo(() => {
    return (contractorsQuery.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [contractorsQuery.data]);

  const busy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  return (
    <section>
      <header className="sectionHead">
        <div>
          <h3>Contractors</h3>
          <p className="muted">Directory of contractors and contacts. Works offline via queued sync.</p>
        </div>

        <div className="actions">
          <button className="btn" type="button" onClick={() => void contractorsQuery.refetch()} disabled={contractorsQuery.isFetching}>
            Refresh
          </button>
        </div>
      </header>

      {contractorsQuery.isLoading ? <p className="muted">Loading contractors...</p> : null}
      {contractorsQuery.isError ? <div className="alert">Failed to load contractors: {(contractorsQuery.error as Error).message}</div> : null}

      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();

          const trimmedName = name.trim();
          if (!trimmedName) return;

          const trimmedSpecialty = specialty.trim();
          const trimmedPhone = phone.trim();
          const trimmedEmail = email.trim();
          const trimmedNotes = notes.trim();

          if (editing) {
            void updateMutation.mutateAsync({
              contractorId: editing.id,
              input: {
                name: trimmedName,
                specialty: trimmedSpecialty ? trimmedSpecialty : null,
                phone: trimmedPhone ? trimmedPhone : null,
                email: trimmedEmail ? trimmedEmail : null,
                notes: trimmedNotes ? trimmedNotes : null,
              },
            });
            return;
          }

          void createMutation.mutateAsync({
            id: createUuid(),
            name: trimmedName,
            specialty: trimmedSpecialty || undefined,
            phone: trimmedPhone || undefined,
            email: trimmedEmail || undefined,
            notes: trimmedNotes || undefined,
          });
        }}
        style={{ marginTop: 10 }}
      >
        <div className="row3">
          <label className="label">
            Name
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. FenceCo" required />
          </label>

          <label className="label">
            Specialty
            <input className="input" value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="e.g. Fencing" />
          </label>

          <label className="label">
            Phone
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
          </label>
        </div>

        <div className="row3" style={{ marginTop: 10 }}>
          <label className="label">
            Email
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Optional" />
          </label>

          <label className="label">
            Notes
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </label>

          <div />
        </div>

        <div className="actions">
          <button className="btn btnPrimary" type="submit" disabled={busy || !name.trim()}>
            {editing
              ? updateMutation.isPending
                ? "Saving..."
                : "Save Changes"
              : createMutation.isPending
                ? "Creating..."
                : "Create Contractor"}
          </button>

          {editing ? (
            <button
              className="btn"
              type="button"
              onClick={() => {
                setEditing(null);
                setName("");
                setSpecialty("");
                setPhone("");
                setEmail("");
                setNotes("");
              }}
              disabled={busy}
            >
              Cancel
            </button>
          ) : null}
        </div>

        {createMutation.isError ? <div className="alert">{(createMutation.error as Error).message}</div> : null}
        {updateMutation.isError ? <div className="alert">{(updateMutation.error as Error).message}</div> : null}
      </form>

      <div className="hr" />

      <div className="tableWrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Specialty</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {contractorsSorted.map((c) => (
              <tr key={c.id}>
                <td className="mono">{c.name}</td>
                <td className="muted">{c.specialty ?? ""}</td>
                <td className="muted">{c.phone ?? ""}</td>
                <td className="muted">{c.email ?? ""}</td>
                <td className="muted">{new Date(c.updatedAt).toLocaleString()}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <div className="actions" style={{ justifyContent: "flex-end" }}>
                    <button
                      className="btn"
                      type="button"
                      onClick={() => {
                        setEditing(c);
                        setName(c.name);
                        setSpecialty(c.specialty ?? "");
                        setPhone(c.phone ?? "");
                        setEmail(c.email ?? "");
                        setNotes(c.notes ?? "");
                      }}
                      disabled={busy}
                    >
                      Edit
                    </button>
                    <button
                      className="btn"
                      type="button"
                      onClick={() => {
                        if (!confirm(`Delete contractor "${c.name}"?`)) return;
                        void deleteMutation.mutateAsync(c.id);
                      }}
                      disabled={busy}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {contractorsSorted.length === 0 && !contractorsQuery.isLoading ? (
              <tr>
                <td className="muted" colSpan={6}>
                  No contractors yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {deleteMutation.isError ? (
        <div className="alert" style={{ marginTop: 10 }}>
          {(deleteMutation.error as Error).message}
        </div>
      ) : null}
    </section>
  );
}
