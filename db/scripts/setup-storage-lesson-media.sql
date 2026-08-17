-- ============================================================================
-- Itera storage setup — `lesson-media` bucket for authored lesson assets
-- Targets the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY. NOT DFL prod.
--
-- ⚠️ NOT run by db/scripts/apply-migrations.sh, same reason as the `avatars` and
-- `artifacts` siblings: that flow connects as `postgres`, which is not a member
-- of `supabase_storage_admin`. Apply with elevated privileges — the Dashboard
-- SQL editor or the Management API. Idempotent, so re-running is safe.
--
-- ⚠️ THIS FILE IS NEW, AND THE BUCKET IS OLDER THAN IT (criado em 2026-07-30).
-- Até agora os limites eram configuração de dashboard que não existia em lugar
-- nenhum do repo — a única cópia escrita era uma frase na guidance do
-- `iterahq/itera-mcp`, com a data da medição, porque medir era o único jeito de
-- saber. Os valores abaixo são o estado MEDIDO em 2026-08-12 via
-- `GET /storage/v1/bucket/lesson-media`, mais o `image/gif`.
--
-- Escopo deliberado: este script mexe SÓ na linha de `storage.buckets`. As
-- policies de `storage.objects` deste bucket não são tocadas — a escrita hoje é
-- de autoria (service_role, pelo caminho de upload da Storage API), e mudar
-- policy que eu não consigo inspecionar seria mudar segurança às cegas.
--
-- POR QUE `image/gif` (2026-08-12)
-- --------------------------------
-- Um loop curto é a forma natural de mostrar "antes → depois" de um comando ou
-- de um clique, e ele não precisa de kind novo nem campo novo: um GIF é uma
-- imagem em `instruction.image_url` e já toca e repete sozinho. O que faltava
-- era só o MIME na allowlist, então a aula ou saía sem o movimento ou o autor
-- descobria o bloqueio depois de escrever a lição inteira.
--
-- `video_url` NÃO resolve o mesmo problema: ele desenha um player COM controles
-- e não dá autoplay nem loop, então um "clipe" de 3 segundos vira um botão de
-- play que ninguém aperta.
--
-- SECURITY (skill app-security)
-- -----------------------------
-- - Bucket é PUBLIC-READ de propósito: são assets de aula, citados por URL crua
--   dentro do `spec` da activity. Nada sigiloso mora aqui.
-- - O teto de 5 MiB CONTINUA valendo para o GIF, e é o controle que importa:
--   estas aulas rodam em rede de escola, onde um arquivo grande é o asset que
--   simplesmente não chega. GIF é o formato mais fácil de estourar sem querer.
-- - A allowlist segue sendo só imagem. GIF não executa script; o vetor real de
--   um bucket público é `image/svg+xml`, que já estava liberado antes desta
--   mudança e não é ampliado por ela.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lesson-media',
  'lesson-media',
  true,
  5242880, -- 5 MiB
  array['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
