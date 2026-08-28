# Dashboard de Aderência - Fábrica ⇄ Fazenda

Dashboard operacional para monitoramento de aderência entre tempo planejado e executado em viagens entre fábrica e fazendas.

## 🎯 Objetivo

Fornecer uma visão clara e acionável da saúde operacional, permitindo identificar rapidamente veículos atrasados, visualizar progresso das viagens e tomar decisões baseadas em dados.

## 🚀 Como Executar

### Opção 1: Servidor HTTP Simples (Python)

```bash
# Python 3
python -m http.server 8000

# Acesse: http://localhost:8000
```

### Opção 2: Servidor HTTP Simples (Node.js)

```bash
# Instalar http-server globalmente
npm install -g http-server

# Executar
http-server -p 8000

# Acesse: http://localhost:8000
```

### Opção 3: Abrir Diretamente

Simplesmente abra o arquivo `index.html` no navegador (algumas funcionalidades podem não funcionar devido a restrições CORS).

## 📋 Funcionalidades

### Panorama Operacional
- Total de veículos em viagem
- Aderência geral (%)
- Quantidade e percentual de veículos atrasados
- Quantidade e percentual de veículos em risco
- Barra de saúde da operação (visualização agregada)

### Top 5 Veículos Críticos
- Cards destacados com os 5 veículos mais críticos
- Informações detalhadas: placa, motorista, etapa, KM previsto/executado
- Indicador de pausa para almoço
- Barra de progresso visual

### Ranking Geral
- Lista completa de todos os veículos ordenados por criticidade
- Informações detalhadas em formato tabular
- Scroll automático no modo TV
- Filtro por fazenda

### Recursos Adicionais
- **Atualização Automática**: Dados atualizados a cada 2 minutos
- **Modo TV**: Auto-scroll contínuo para exibição em salas de controle
- **Filtro por Fazenda**: Focar em operações específicas
- **Indicador de Almoço**: Mostra quando veículo está pausado
- **Design Control Room**: Layout otimizado para TVs grandes

## 🎨 Design

### Paleta de Cores
- **Fundo**: Azul escuro (#0a0e27) - Control room style
- **Cards**: Azul médio escuro (#1a1f3a)
- **Verde**: Aderente (#10b981)
- **Amarelo**: Risco (#f59e0b)
- **Vermelho**: Atrasado (#ef4444)

### Tipografia
- Títulos: 24-32px (bold)
- Métricas: 48-64px (bold)
- Texto normal: 16-18px

## 📊 Lógica de Cálculo

### Aderência por Veículo
```
KM Previsto = Velocidade Planejada × (Tempo Decorrido / 60)
KM Executado = Soma dos KMs do AVL desde início da etapa
Diferença = KM Executado - KM Previsto
Aderência = (KM Executado / KM Previsto) × 100
```

### Classificação
- **Aderente** (Verde): Aderência ≥ 95%
- **Risco** (Amarelo): Aderência entre 85% e 95%
- **Atrasado** (Vermelho): Aderência < 85%

### Tratamento de Pausas
- Quando veículo está em almoço, o cronômetro é pausado
- Tempo de almoço não conta para cálculo de atraso
- Indicador visual "⏸️ ALMOÇO" é exibido

## 🔧 Tecnologias Utilizadas

- **HTML5**: Estrutura
- **Tailwind CSS**: Estilização
- **Alpine.js**: Reatividade e lógica
- **Vanilla JavaScript**: Cálculos e dados mockados

## 📁 Estrutura de Arquivos

```
dashboard-aderencia/
├── index.html          # Página principal
├── css/
│   └── styles.css      # Estilos customizados
├── js/
│   ├── app.js          # Lógica principal (Alpine.js)
│   ├── mock-data.js    # Gerador de dados mockados
│   └── calculations.js # Funções de cálculo
└── README.md           # Esta documentação
```

## 📝 Dados Mockados

O dashboard utiliza dados mockados realistas para demonstração:
- 15 veículos em diferentes estágios de viagem
- Variação de aderência (aderentes, risco, atrasados)
- Simulação de etapas (IDA/VOLTA)
- Simulação de pausas para almoço
- Atualização automática a cada 2 minutos

## 🎯 Próximos Passos (Integração Real)

Para integrar com dados reais:
1. Substituir `gerarDadosMockados()` por chamada à API
2. Implementar WebSocket ou polling para atualização em tempo real
3. Conectar com sistema SGF para dados de OT
4. Integrar com AVL para dados de localização
5. Implementar autenticação/autorização

## 📞 Suporte

Para dúvidas ou sugestões, consulte a documentação do projeto ou entre em contato com a equipe de desenvolvimento.

---

**Versão**: 1.0.0  
**Última atualização**: Janeiro 2025

