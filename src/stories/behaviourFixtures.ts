/**
 * Fixtures of the production BEHAVIOURS that had no matrix row until T4 of plan
 * `20260924-activity-type-one-behavior-rule` (v3).
 *
 * Each spec is a byte copy of ONE production row of `itera.activities`, read
 * read-only on 2026-09-24 (`itera-supabase-helpers query`). The `ref` is the
 * first 8 characters of the row id: enough to find the row, not a key. The
 * payloads are authored course content — no learner data, no PII.
 *
 *   ref        today's kind          behaviour (future kind, plan ADR-1)
 *   f353da62   terminal_sandbox      inputMode=options · granularity command
 *                                    → `terminal_pick_command`
 *   22646523   terminal_sandbox      inputMode=options · granularity token
 *                                    → `terminal_build_command`
 *   eb426dc5   document              rubric.mode=ai-judge
 *                                    → `document_ai_judge`
 *
 * The chat behaviours (slots `select`, context chips) reuse
 * `src/test/fixtures/sandbox-scenarios.json` (c1, c2), which already carries
 * the production shapes of those two renderers.
 */
export const TERMINAL_PICK_COMMAND_SPEC: Record<string, unknown> = {
  "id": "git-status-basico",
  "steps": [
    {
      "id": "olhar",
      "hint": {
        "en": "git status",
        "pt": "git status"
      },
      "expose": {
        "commands": [
          "git status",
          "git log",
          "ls"
        ],
        "optionGranularity": "command"
      },
      "prompt": {
        "en": "You just created the `ideias.md` file. The `git status` command asks \"so, how are things?\". Ask it now.",
        "pt": "Você acabou de criar o arquivo `ideias.md`. O `git status` é a pergunta \"e aí, como estão as coisas?\". Faça ela agora."
      },
      "unlock": {
        "commandMatched": {
          "cmd": "git status"
        }
      }
    }
  ],
  "title": {
    "en": "What `git status` tells you",
    "pt": "O que o `git status` te conta"
  },
  "reveal": {
    "recap": {
      "en": "The `git status` command shows what changed since the last commit. A new file shows up as **untracked**. When nothing changed, the answer is **working tree clean**. 🎉",
      "pt": "O `git status` mostra o que mudou desde o último commit. Um arquivo novo aparece como **não rastreado**. Quando não há nada novo, a resposta é **árvore de trabalho limpa**. 🎉"
    },
    "masterLine": [
      "git status"
    ]
  },
  "success": {
    "stepCompleted": {
      "id": "olhar"
    }
  },
  "openness": "fixed",
  "inputMode": "options",
  "initialState": {
    "ps1": "aluno@itera:~/meu-site$",
    "engine": "none",
    "welcome": [
      "Você está na pasta do seu site, já com o Git ligado.",
      "O arquivo README.md já foi salvo num commit.",
      "Você acabou de criar um arquivo novo aqui: ideias.md."
    ],
    "windowTitle": "bash — sandbox",
    "cannedOutput": {
      "ls": {
        "lines": [
          "README.md  ideias.md"
        ]
      },
      "git log": {
        "lines": [
          "a1b2c3d (HEAD -> main)  primeiro commit"
        ]
      },
      "git status": {
        "lines": [
          "No ramo main",
          "Arquivos não rastreados:",
          "  ideias.md",
          "",
          "nada adicionado ao commit, mas há arquivos não rastreados"
        ]
      }
    },
    "unknownCommand": {
      "lines": [
        "comando não reconhecido neste sandbox"
      ],
      "isError": true
    }
  }
};

export const TERMINAL_BUILD_COMMAND_SPEC: Record<string, unknown> = {
  "id": "git-add-arquivo",
  "steps": [
    {
      "id": "adicionar",
      "hint": {
        "en": "git add notas.md",
        "pt": "git add notas.md"
      },
      "expose": {
        "tokens": [
          "git",
          "add",
          "notas.md",
          "rascunho.md",
          "."
        ],
        "optionGranularity": "token"
      },
      "prompt": {
        "en": "Both new files are already in the folder. Stage **only `notas.md`**. Leave `rascunho.md` out.",
        "pt": "Os dois arquivos novos já estão na pasta. Prepare **só o `notas.md`**. O `rascunho.md` fica de fora."
      },
      "unlock": {
        "commandMatched": {
          "cmd": "git add notas.md"
        }
      }
    }
  ],
  "title": {
    "en": "Picking ONE file",
    "pt": "Escolhendo UM arquivo"
  },
  "reveal": {
    "recap": {
      "en": "The `git add` command with a name stages **only that file**. `rascunho.md` stays untracked: you choose what goes into the next commit. 🎉",
      "pt": "O `git add` com um nome prepara **só aquele arquivo**. O `rascunho.md` continua não rastreado: você escolhe o que entra no próximo commit. 🎉"
    },
    "masterLine": [
      "git add notas.md"
    ]
  },
  "success": {
    "stepCompleted": {
      "id": "adicionar"
    }
  },
  "openness": "fixed",
  "inputMode": "options",
  "initialState": {
    "ps1": "aluno@itera:~/meu-site$",
    "engine": "none",
    "welcome": [
      "Repositório pronto, com o README.md já commitado.",
      "Dois arquivos novos apareceram na pasta: notas.md e rascunho.md.",
      "Nenhum dos dois está no Git ainda."
    ],
    "windowTitle": "bash — sandbox",
    "cannedOutput": {
      "git add .": {
        "lines": [
          "adicionado ao stage: notas.md",
          "adicionado ao stage: rascunho.md"
        ]
      },
      "git add notas.md": {
        "lines": [
          "adicionado ao stage: notas.md",
          "não rastreado: rascunho.md"
        ]
      },
      "git add rascunho.md": {
        "lines": [
          "adicionado ao stage: rascunho.md",
          "não rastreado: notas.md"
        ]
      }
    },
    "unknownCommand": {
      "lines": [
        "comando não reconhecido neste sandbox"
      ],
      "isError": true
    }
  }
};

export const DOCUMENT_AI_JUDGE_SPEC: Record<string, unknown> = {
  "body": {
    "en": "Produce the brief: GOAL (e.g., pre-classify advance requests), TOOLS (read receivables, check harvest history), POLICY (credit decision table), GUARDRAILS (exposure limit → human), VERIFICATION.",
    "pt": "Produza o brief: OBJETIVO (ex: pré-classificar pedidos de antecipação), FERRAMENTAS (ler recebíveis, consultar histórico de safra), POLÍTICA (tabela de decisão de crédito), GUARDRAILS (limite de exposição → humano), VERIFICAÇÃO."
  },
  "prompt": {
    "en": "COMMIT — Agricultural receivable/credit agent brief",
    "pt": "COMMIT — Brief do agente de recebível/crédito agro"
  }
};

export const DOCUMENT_AI_JUDGE_RUBRIC: Record<string, unknown> = {
  "mode": "ai-judge",
  "artifact": {
    "en": "Agro credit agent brief (final artifact)",
    "pt": "Brief de agente de crédito agro (artefato final)"
  },
  "criteria": [
    {
      "en": "Clear goal linked to receivables/credit",
      "pt": "Objetivo claro ligado a recebível/crédito"
    },
    {
      "en": "Policy = credit decision table",
      "pt": "Política = tabela de decisão de crédito"
    },
    {
      "en": "Escalation guardrail based on exposure",
      "pt": "Guardrail de escalonamento por exposição"
    },
    {
      "en": "Includes verification of the result",
      "pt": "Inclui verificação do resultado"
    }
  ]
};
