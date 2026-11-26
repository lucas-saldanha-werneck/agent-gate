# agent-gate

Demo independente, sem vínculo com a CI&T. (Independent demo, not affiliated with CI&T.)

O `agent-gate` confere se uma execução de agente de IA cumpriu critérios de aceite escritos em texto simples. Você dá a ele um arquivo de critérios no formato Cenário / Então e o registro das chamadas de ferramenta do agente (JSONL). Ele imprime PASS ou FAIL por critério e sai com código 1 se algum falhar, então pode barrar um job de CI.

Fiz isso depois de ler a vaga de Senior AI Engineer para enablement de SDLC agêntico: ela pede "critérios de aceite executáveis" e "regras bloqueantes em pipelines de CI/CD". Esta é a menor versão que consegui imaginar dessa ideia.

## Como rodar

Precisa de Node 20 ou mais novo. Não tem dependências.

```bash
node bin/agent-gate.mjs examples/changes.criteria examples/good.jsonl   # sai com 0
node bin/agent-gate.mjs examples/changes.criteria examples/bad.jsonl    # sai com 1
npm test
```

Saída da execução ruim (dados de exemplo inventados):

```
Scenario: The agent reads before it writes
  FAIL  every edit_file must be preceded by read_file on the same path  -> edit_file at step 1 ... with no earlier read_file
  FAIL  call run_tests before open_pr  -> run_tests (step 3) came after open_pr (step 2)
...
2/7 criteria passed
```

## Formato dos critérios

```
Scenario: The agent reads before it writes
  Then every edit_file must be preceded by read_file on the same path
  And call run_tests before open_pr
```

Regras aceitas:

- `never call <tool>`
- `call <tool> at most N times`
- `call <tool> before <tool>` (vale sem efeito se o segundo nunca roda)
- `every <tool> must be preceded by <tool> on the same <argumento>`
- `no call fails` e `at most N calls fail`
- `the run takes at most N steps` (conta só chamadas de ferramenta)
- `the final message contains "texto"` e `does not contain "texto"` (última mensagem, sem diferenciar maiúsculas)

Linhas com `#` são comentários. Regra desconhecida dá erro com o número da linha (código de saída 2).

## What was tested

- 11 testes com `node --test`, todos offline: cada regra passando e falhando, os casos de borda (regra sem efeito, última mensagem, contagem de passos), erros do parser e os códigos de saída da linha de comando (0, 1, 2).
- O CI roda esses testes e também confere que o exemplo bom passa e o ruim falha.
- Rodei tudo em Node 26 na minha máquina. O CI usa Node 22.

## What was not tested

- Nenhum registro real de agente. Os arquivos em `examples/` foram escritos à mão por mim e são dados de exemplo inventados.
- O formato do JSONL é o meu (`type`, `tool`, `args`, `ok`). Não tentei adaptar a nenhum framework de agentes nem a OpenTelemetry.
- As regras olham a ordem e a contagem das chamadas. Elas não avaliam se a resposta do agente está certa, e não substituem uma suíte de evals com um modelo avaliador.
- Não é Gherkin completo: não há `Given`/`When`, nem tabelas, nem `Scenario Outline`.
- Windows não foi testado.
