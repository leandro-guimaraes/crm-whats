"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { FlowEditorShell } from "@/components/flows/flow-editor-shell";
import type { FlowRow, FlowNodeRow } from "@/lib/flows/types";

/**
 * Shell do editor de fluxo.
 *
 * Carrega `{flow, nodes}` de `/api/flows/[id]` e repassa para
 * `<FlowBuilder>`. Gerencia o estado de carregamento/erro para que
 * o builder possa se concentrar exclusivamente na edição.
 *
 * Aberto para todo usuário autenticado — o bloqueio de beta que
 * anteriormente retornava 404 para contas não-beta foi removido no
 * PR #134. A API ainda retorna 404 para um id de fluxo que o
 * chamador não possui (RLS), o que resulta no estado
 * "Fluxo não encontrado" abaixo.
 */
export default function PaginaEditorFluxo() {
  const router = useRouter();
  const params = useParams<{ id: string }>();

  const [fluxo, setFluxo] = useState<FlowRow | null>(null);
  const [nos, setNos] = useState<FlowNodeRow[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [naoEncontrado, setNaoEncontrado] = useState(false);

  useEffect(() => {
    if (!params.id) return;
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch(`/api/flows/${params.id}`);
        if (res.status === 404) {
          if (!cancelado) setNaoEncontrado(true);
          return;
        }
        if (!res.ok) throw new Error(`Falhou: ${res.status}`);
        const json = (await res.json()) as {
          flow: FlowRow;
          nodes: FlowNodeRow[];
        };
        if (!cancelado) {
          setFluxo(json.flow);
          setNos(json.nodes ?? []);
        }
      } catch (err) {
        if (!cancelado) {
          console.error(err);
          toast.error("Não foi possível carregar o fluxo.");
        }
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [params.id]);

  if (carregando) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (naoEncontrado || !fluxo) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">Fluxo não encontrado.</p>
        <button
          type="button"
          onClick={() => router.push("/flows")}
          className="text-sm text-primary hover:opacity-80"
        >
          ← Voltar para fluxos
        </button>
      </div>
    );
  }

  return <FlowEditorShell initialFlow={fluxo} initialNodes={nos} />;
}