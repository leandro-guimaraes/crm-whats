'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { Contact, Tag, ContactTag } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Search,
  Plus,
  Upload,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  Users,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
} from 'lucide-react';
import { ContactForm } from '@/components/contacts/contact-form';
import { ContactDetailView } from '@/components/contacts/contact-detail-view';
import { ImportModal } from '@/components/contacts/import-modal';
import { CustomFieldsManager } from '@/components/contacts/custom-fields-manager';
import { useCan } from '@/hooks/use-can';
import { GatedButton } from '@/components/ui/gated-button';
import { Checkbox } from '@/components/ui/checkbox';

const TAMANHO_PAGINA = 25;

interface ContatoComTags extends Contact {
  tags?: Tag[];
}

export default function PaginaContatos() {
  const supabase = createClient();
  const podeEditar = useCan('send-messages');
  const podeEditarConfiguracoes = useCan('edit-settings');

  const [contatos, setContatos] = useState<ContatoComTags[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(0);
  const [totalRegistros, setTotalRegistros] = useState(0);

  // Modais
  const [formularioAberto, setFormularioAberto] = useState(false);
  const [contatoEditando, setContatoEditando] = useState<Contact | null>(null);
  const [tagsContatoEditando, setTagsContatoEditando] = useState<ContactTag[]>([]);
  const [detalheAberto, setDetalheAberto] = useState(false);
  const [idContatoDetalhe, setIdContatoDetalhe] = useState<string | null>(null);
  const [importacaoAberta, setImportacaoAberta] = useState(false);
  const [camposPersonalizadosAberto, setCamposPersonalizadosAberto] = useState(false);
  const [confirmacaoExclusaoAberta, setConfirmacaoExclusaoAberta] = useState(false);
  const [alvoExclusao, setAlvoExclusao] = useState<Contact | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  // Seleção em massa (escopo da página — apenas as linhas carregadas são selecionáveis)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [exclusaoEmMassaAberta, setExclusaoEmMassaAberta] = useState(false);

  // Mapa de todas as tags para exibição
  const [mapaTags, setMapaTags] = useState<Record<string, Tag>>({});

  const buscarTags = useCallback(async () => {
    const { data } = await supabase.from('tags').select('*');
    if (data) {
      const mapa: Record<string, Tag> = {};
      data.forEach((t) => (mapa[t.id] = t));
      setMapaTags(mapa);
    }
  }, [supabase]);

  const buscarContatos = useCallback(async () => {
    setCarregando(true);
    // As linhas visíveis estão prestes a mudar — descarta qualquer seleção
    // que se referia à página/resultados de busca anteriores, para que a
    // barra de ações em massa não possa agir sobre linhas que o usuário
    // não consegue mais ver.
    setSelecionados(new Set());

    const de = pagina * TAMANHO_PAGINA;
    const ate = de + TAMANHO_PAGINA - 1;

    let query = supabase
      .from('contacts')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(de, ate);

    if (busca.trim()) {
      const termo = `%${busca.trim()}%`;
      query = query.or(`name.ilike.${termo},phone.ilike.${termo},email.ilike.${termo}`);
    }

    const { data, count, error } = await query;

    if (error) {
      toast.error('Falha ao carregar contatos');
      setCarregando(false);
      return;
    }

    setTotalRegistros(count ?? 0);

    if (!data || data.length === 0) {
      setContatos([]);
      setCarregando(false);
      return;
    }

    // Busca as tags destes contatos
    const idsContatos = data.map((c) => c.id);
    const { data: tagsContatos } = await supabase
      .from('contact_tags')
      .select('contact_id, tag_id')
      .in('contact_id', idsContatos);

    const tagsPorContato: Record<string, string[]> = {};
    tagsContatos?.forEach((ct) => {
      if (!tagsPorContato[ct.contact_id]) tagsPorContato[ct.contact_id] = [];
      tagsPorContato[ct.contact_id].push(ct.tag_id);
    });

    const enriquecidos: ContatoComTags[] = data.map((c) => ({
      ...c,
      tags: (tagsPorContato[c.id] ?? [])
        .map((tid) => mapaTags[tid])
        .filter(Boolean),
    }));

    setContatos(enriquecidos);
    setCarregando(false);
  }, [supabase, pagina, busca, mapaTags]);

  // Buscas de dados carregadas uma vez na montagem. Cada setter interno executa
  // dentro de uma conclusão de promise assíncrona (await do Supabase), não
  // sincronamente no corpo do effect, portanto o cascade que a regra do lint
  // avisa não se aplica aqui.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    buscarTags();
  }, [buscarTags]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    buscarContatos();
  }, [buscarContatos]);

  function abrirFormularioAdicao() {
    setContatoEditando(null);
    setTagsContatoEditando([]);
    setFormularioAberto(true);
  }

  async function abrirFormularioEdicao(contato: Contact) {
    const { data } = await supabase
      .from('contact_tags')
      .select('*')
      .eq('contact_id', contato.id);
    setContatoEditando(contato);
    setTagsContatoEditando(data ?? []);
    setFormularioAberto(true);
  }

  function abrirDetalhe(idContato: string) {
    setIdContatoDetalhe(idContato);
    setDetalheAberto(true);
  }

  function confirmarExclusao(contato: Contact) {
    setAlvoExclusao(contato);
    setConfirmacaoExclusaoAberta(true);
  }

  async function handleExcluir() {
    if (!alvoExclusao) return;
    setExcluindo(true);

    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', alvoExclusao.id);

    if (error) {
      toast.error('Falha ao excluir contato');
    } else {
      toast.success('Contato excluído');
      buscarContatos();
    }

    setExcluindo(false);
    setConfirmacaoExclusaoAberta(false);
    setAlvoExclusao(null);
  }

  const todosDaPaginaSelecionados =
    contatos.length > 0 && contatos.every((c) => selecionados.has(c.id));
  const algunsDaPaginaSelecionados = contatos.some((c) => selecionados.has(c.id));

  function alternarSelecaoTodos() {
    setSelecionados((prev) => {
      const proximo = new Set(prev);
      if (todosDaPaginaSelecionados) {
        contatos.forEach((c) => proximo.delete(c.id));
      } else {
        contatos.forEach((c) => proximo.add(c.id));
      }
      return proximo;
    });
  }

  function alternarSelecao(id: string) {
    setSelecionados((prev) => {
      const proximo = new Set(prev);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  async function handleExclusaoEmMassa() {
    const ids = [...selecionados];
    if (ids.length === 0) return;
    setExcluindo(true);

    const { error } = await supabase.from('contacts').delete().in('id', ids);

    if (error) {
      toast.error('Falha ao excluir contatos');
    } else {
      toast.success(`${ids.length} contato${ids.length === 1 ? '' : 's'} excluído${ids.length === 1 ? '' : 's'}`);
      setSelecionados(new Set());
      buscarContatos();
    }

    setExcluindo(false);
    setExclusaoEmMassaAberta(false);
  }

  const totalPaginas = Math.ceil(totalRegistros / TAMANHO_PAGINA);
  const temProxima = pagina < totalPaginas - 1;
  const temAnterior = pagina > 0;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contatos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie sua lista de contatos. {totalRegistros > 0 && `${totalRegistros} contatos no total.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {podeEditarConfiguracoes && (
            <Button
              variant="outline"
              onClick={() => setCamposPersonalizadosAberto(true)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              <SlidersHorizontal className="size-4" />
              Campos personalizados
            </Button>
          )}
          <GatedButton
            variant="outline"
            canAct={podeEditar}
            gateReason="adicionar ou importar contatos"
            onClick={() => setImportacaoAberta(true)}
            className="border-border text-muted-foreground hover:bg-muted"
          >
            <Upload className="size-4" />
            Importar
          </GatedButton>
          <GatedButton
            canAct={podeEditar}
            gateReason="adicionar ou importar contatos"
            onClick={abrirFormularioAdicao}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Plus className="size-4" />
            Adicionar Contato
          </GatedButton>
        </div>
      </div>

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            // Reinicia a paginação quando a consulta muda — o conjunto de
            // resultados encolhe/cresce, a página N pode não ser mais válida.
            setPagina(0);
          }}
          placeholder="Buscar por nome, telefone ou e-mail..."
          className="pl-8 bg-card border-border text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {/* Barra de ações em massa */}
      {selecionados.size > 0 && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/40 px-4 py-2">
          <p className="text-sm text-foreground">
            <span className="font-medium">{selecionados.size}</span>{' '}
            {selecionados.size === 1 ? 'contato selecionado' : 'contatos selecionados'}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelecionados(new Set())}
              className="text-muted-foreground hover:text-foreground"
            >
              Limpar
            </Button>
            <GatedButton
              variant="destructive"
              size="sm"
              canAct={podeEditar}
              gateReason="excluir contatos"
              onClick={() => setExclusaoEmMassaAberta(true)}
            >
              <Trash2 className="size-4" />
              Excluir selecionados
            </GatedButton>
          </div>
        </div>
      )}

      {/* Tabela */}
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="w-10">
                <Checkbox
                  checked={todosDaPaginaSelecionados}
                  indeterminate={!todosDaPaginaSelecionados && algunsDaPaginaSelecionados}
                  onCheckedChange={alternarSelecaoTodos}
                  disabled={contatos.length === 0}
                  aria-label="Selecionar todos os contatos desta página"
                />
              </TableHead>
              <TableHead className="text-muted-foreground">Nome</TableHead>
              <TableHead className="text-muted-foreground">Telefone</TableHead>
              <TableHead className="text-muted-foreground hidden md:table-cell">E-mail</TableHead>
              <TableHead className="text-muted-foreground hidden lg:table-cell">Empresa</TableHead>
              <TableHead className="text-muted-foreground hidden md:table-cell">Tags</TableHead>
              <TableHead className="text-muted-foreground hidden lg:table-cell">Criado em</TableHead>
              <TableHead className="text-muted-foreground w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {carregando ? (
              <TableRow className="border-border">
                <TableCell colSpan={8} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="size-6 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Carregando contatos...</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : contatos.length === 0 ? (
              <TableRow className="border-border">
                <TableCell colSpan={8} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <Users className="size-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {busca ? 'Nenhum contato encontrado para sua busca.' : 'Nenhum contato ainda.'}
                    </p>
                    {!busca && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={abrirFormularioAdicao}
                        className="mt-2 border-border text-muted-foreground hover:bg-muted"
                      >
                        <Plus className="size-3.5" />
                        Adicionar seu primeiro contato
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              contatos.map((contato) => (
                <TableRow
                  key={contato.id}
                  className="border-border hover:bg-muted/50 cursor-pointer"
                  onClick={() => abrirDetalhe(contato.id)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selecionados.has(contato.id)}
                      onCheckedChange={() => alternarSelecao(contato.id)}
                      aria-label={`Selecionar ${contato.name || contato.phone}`}
                    />
                  </TableCell>
                  <TableCell className="text-foreground font-medium">
                    {contato.name || <span className="text-muted-foreground italic">Sem nome</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {contato.phone}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden md:table-cell text-sm">
                    {contato.email || <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden lg:table-cell text-sm">
                    {contato.company || <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {contato.tags && contato.tags.length > 0 ? (
                        contato.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag.id}
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                            style={{
                              backgroundColor: tag.color + '20',
                              color: tag.color,
                            }}
                          >
                            {tag.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                      {contato.tags && contato.tags.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{contato.tags.length - 3}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs hidden lg:table-cell">
                    {new Date(contato.created_at).toLocaleDateString('pt-BR', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={(e) => e.stopPropagation()}
                          />
                        }
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="bg-popover border-border"
                      >
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            abrirFormularioEdicao(contato);
                          }}
                          className="text-popover-foreground focus:bg-muted focus:text-foreground"
                        >
                          <Pencil className="size-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-border" />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            confirmarExclusao(contato);
                          }}
                        >
                          <Trash2 className="size-4" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Paginação */}
      {totalPaginas > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Exibindo {pagina * TAMANHO_PAGINA + 1}–{Math.min((pagina + 1) * TAMANHO_PAGINA, totalRegistros)} de{' '}
            {totalRegistros}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!temAnterior}
              onClick={() => setPagina((p) => p - 1)}
              className="border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-xs text-muted-foreground px-2">
              Página {pagina + 1} de {totalPaginas}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!temProxima}
              onClick={() => setPagina((p) => p + 1)}
              className="border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Diálogo de Formulário de Contato */}
      <ContactForm
        open={formularioAberto}
        onOpenChange={setFormularioAberto}
        contact={contatoEditando}
        contactTags={tagsContatoEditando}
        onSaved={() => {
          buscarContatos();
          buscarTags();
        }}
        onViewExisting={(id) => {
          setFormularioAberto(false);
          abrirDetalhe(id);
        }}
      />

      {/* Painel de Detalhe do Contato */}
      <ContactDetailView
        open={detalheAberto}
        onOpenChange={setDetalheAberto}
        contactId={idContatoDetalhe}
        onUpdated={buscarContatos}
      />

      {/* Modal de Importação */}
      <ImportModal
        open={importacaoAberta}
        onOpenChange={setImportacaoAberta}
        onImported={buscarContatos}
      />

      {/* Gerenciador de Campos Personalizados (admin+) */}
      {podeEditarConfiguracoes && (
        <CustomFieldsManager
          open={camposPersonalizadosAberto}
          onOpenChange={setCamposPersonalizadosAberto}
        />
      )}

      {/* Confirmação de Exclusão */}
      <Dialog open={confirmacaoExclusaoAberta} onOpenChange={setConfirmacaoExclusaoAberta}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">Excluir Contato</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Tem certeza que deseja excluir{' '}
              <span className="text-popover-foreground font-medium">
                {alvoExclusao?.name || alvoExclusao?.phone}
              </span>
              ? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setConfirmacaoExclusaoAberta(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleExcluir}
              disabled={excluindo}
            >
              {excluindo && <Loader2 className="size-4 animate-spin" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de Exclusão em Massa */}
      <Dialog open={exclusaoEmMassaAberta} onOpenChange={setExclusaoEmMassaAberta}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">
              Excluir {selecionados.size} {selecionados.size === 1 ? 'Contato' : 'Contatos'}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Tem certeza que deseja excluir{' '}
              <span className="text-popover-foreground font-medium">
                {selecionados.size} {selecionados.size === 1 ? 'contato' : 'contatos'}
              </span>
              ? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setExclusaoEmMassaAberta(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleExclusaoEmMassa}
              disabled={excluindo}
            >
              {excluindo && <Loader2 className="size-4 animate-spin" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}