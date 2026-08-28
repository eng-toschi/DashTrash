// Lógica principal do dashboard com Alpine.js

function dashboardApp() {
    return {
        // Estado
        veiculos: [],
        ultimaAtualizacao: new Date(),
        modoTv: false,
        intervaloAtualizacao: null,
        intervaloScroll: null,
        
        // Filtros e busca
        termoBusca: "",
        filtros: {
            busca: "",
            status: [],
            etapa: [],
            fazendas: [],
            aderenciaMin: undefined,
            aderenciaMax: undefined
        },
        debounceBusca: null,
        
        // Paginação
        paginaAtual: 1,
        itensPorPagina: 50,
        totalPaginas: 1,
        
        // Top críticos
        topCriticosLimit: 10,
        mostrarTodosCriticos: false,

        // Computed properties
        get veiculosFiltrados() {
            return filtrarVeiculos(this.veiculos, this.filtros);
        },

        get fazendasUnicas() {
            return extrairFazendasUnicas(this.veiculos);
        },

        get veiculosOrdenados() {
            return ordenarPorCriticidade(this.veiculosFiltrados);
        },

        get veiculosPaginados() {
            const resultado = paginarVeiculos(
                this.veiculosOrdenados,
                this.paginaAtual,
                this.itensPorPagina
            );
            this.totalPaginas = resultado.totalPaginas;
            return resultado.dados;
        },

        get topCriticos() {
            const limit = this.mostrarTodosCriticos ? 50 : this.topCriticosLimit;
            return getTopCriticos(this.veiculosFiltrados, limit);
        },

        get aderenciaGeral() {
            return calcularAderenciaGeral(this.veiculosFiltrados);
        },

        get veiculosAtrasados() {
            return contarVeiculosPorStatus(this.veiculosFiltrados).atrasados;
        },

        get veiculosRisco() {
            return contarVeiculosPorStatus(this.veiculosFiltrados).risco;
        },

        get veiculosAderentes() {
            return contarVeiculosPorStatus(this.veiculosFiltrados).aderentes;
        },

        get totalResultados() {
            return this.veiculosFiltrados.length;
        },

        get temFiltrosAtivos() {
            return this.filtros.busca !== "" ||
                   this.filtros.status.length > 0 ||
                   this.filtros.etapa.length > 0 ||
                   this.filtros.fazendas.length > 0 ||
                   this.filtros.aderenciaMin !== undefined ||
                   this.filtros.aderenciaMax !== undefined;
        },

        // Métodos
        init() {
            // Carregar dados iniciais (1000 veículos para teste)
            this.carregarDados();
            
            // Configurar debounce para busca
            this.debounceBusca = debounce((termo) => {
                this.filtros.busca = termo;
                this.paginaAtual = 1; // Resetar para primeira página
            }, 300);
            
            // Configurar atualização automática a cada 2 minutos
            this.intervaloAtualizacao = setInterval(() => {
                this.atualizarDados();
            }, 2 * 60 * 1000); // 2 minutos

            // Configurar auto-scroll para modo TV
            this.configurarAutoScroll();
        },

        carregarDados() {
            const dados = gerarDadosMockados(1000);
            this.veiculos = dados.veiculos;
            this.ultimaAtualizacao = new Date(dados.ultimaAtualizacao);
        },

        atualizarDados() {
            const dadosAtuais = {
                veiculos: this.veiculos,
                ultimaAtualizacao: this.ultimaAtualizacao.toISOString()
            };
            
            const dadosAtualizados = atualizarDadosMockados(dadosAtuais);
            this.veiculos = dadosAtualizados.veiculos;
            this.ultimaAtualizacao = new Date(dadosAtualizados.ultimaAtualizacao);
        },

        // Busca
        onBuscaChange() {
            this.debounceBusca(this.termoBusca);
        },

        // Filtros
        toggleFiltroStatus(status) {
            const index = this.filtros.status.indexOf(status);
            if (index > -1) {
                this.filtros.status.splice(index, 1);
            } else {
                this.filtros.status.push(status);
            }
            this.paginaAtual = 1;
        },

        toggleFiltroEtapa(etapa) {
            const index = this.filtros.etapa.indexOf(etapa);
            if (index > -1) {
                this.filtros.etapa.splice(index, 1);
            } else {
                this.filtros.etapa.push(etapa);
            }
            this.paginaAtual = 1;
        },

        toggleFiltroFazenda(fazenda) {
            const index = this.filtros.fazendas.indexOf(fazenda);
            if (index > -1) {
                this.filtros.fazendas.splice(index, 1);
            } else {
                this.filtros.fazendas.push(fazenda);
            }
            this.paginaAtual = 1;
        },

        limparFiltros() {
            this.termoBusca = "";
            this.filtros = {
                busca: "",
                status: [],
                etapa: [],
                fazendas: [],
                aderenciaMin: undefined,
                aderenciaMax: undefined
            };
            this.paginaAtual = 1;
        },

        filtrarPorStatus(status) {
            this.limparFiltros();
            this.filtros.status = [status];
            this.paginaAtual = 1;
        },

        // Paginação
        irParaPagina(pagina) {
            if (pagina >= 1 && pagina <= this.totalPaginas) {
                this.paginaAtual = pagina;
                // Scroll para o topo da tabela
                const lista = document.getElementById('lista-veiculos');
                if (lista) {
                    lista.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
        },

        proximaPagina() {
            if (this.paginaAtual < this.totalPaginas) {
                this.irParaPagina(this.paginaAtual + 1);
            }
        },

        paginaAnterior() {
            if (this.paginaAtual > 1) {
                this.irParaPagina(this.paginaAtual - 1);
            }
        },

        configurarAutoScroll() {
            // Observar mudanças no modo TV
            this.$watch('modoTv', (value) => {
                if (value) {
                    this.iniciarAutoScroll();
                } else {
                    this.pararAutoScroll();
                }
            });
        },

        iniciarAutoScroll() {
            const lista = document.getElementById('lista-veiculos');
            if (!lista) return;

            setTimeout(() => {
                let scrollPosition = 0;
                const scrollSpeed = 0.5;
                let maxScroll = lista.scrollHeight - lista.clientHeight;

                this.intervaloScroll = setInterval(() => {
                    maxScroll = lista.scrollHeight - lista.clientHeight;
                    
                    if (maxScroll <= 0) {
                        scrollPosition = 0;
                        return;
                    }

                    scrollPosition += scrollSpeed;
                    
                    if (scrollPosition >= maxScroll) {
                        scrollPosition = 0;
                        lista.scrollTo({ top: 0, behavior: 'smooth' });
                        setTimeout(() => {
                            scrollPosition = 0;
                        }, 500);
                    } else {
                        lista.scrollTop = scrollPosition;
                    }
                }, 16);
            }, 500);
        },

        pararAutoScroll() {
            if (this.intervaloScroll) {
                clearInterval(this.intervaloScroll);
                this.intervaloScroll = null;
            }
            const lista = document.getElementById('lista-veiculos');
            if (lista) {
                lista.scrollTo({ top: 0, behavior: 'smooth' });
            }
        },

        // Helpers de formatação
        formatTime(date) {
            if (!date) return "";
            const d = new Date(date);
            return d.toLocaleTimeString('pt-BR', { 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit' 
            });
        },

        formatTempoDecorrido(minutos) {
            const horas = Math.floor(minutos / 60);
            const mins = Math.floor(minutos % 60);
            return `${horas}h ${mins}m`;
        },

        // Helpers de estilo
        getAderenciaGeralColor(aderencia) {
            if (aderencia >= 95) return "text-emerald-600";
            if (aderencia >= 85) return "text-amber-600";
            return "text-rose-600";
        },

        getStatusColor(status) {
            switch(status) {
                case "Aderente": return "bg-emerald-500";
                case "Risco": return "bg-amber-500";
                case "Atrasado": return "bg-rose-500";
                default: return "bg-gray-500";
            }
        },

        getStatusBadgeClass(status) {
            switch(status) {
                case "Aderente": return "bg-emerald-50 text-emerald-700 border border-emerald-200";
                case "Risco": return "bg-amber-50 text-amber-700 border border-amber-200";
                case "Atrasado": return "bg-rose-50 text-rose-700 border border-rose-200";
                default: return "bg-gray-100 text-gray-700 border border-gray-300";
            }
        },

        getStatusBorderColor(status) {
            switch(status) {
                case "Aderente": return "border-emerald-400";
                case "Risco": return "border-amber-400";
                case "Atrasado": return "border-rose-400";
                default: return "border-gray-300";
            }
        },

        getEtapaBadgeClass(etapa) {
            return etapa === "IDA" 
                ? "bg-blue-100 text-blue-700 border border-blue-300"
                : "bg-indigo-100 text-indigo-700 border border-indigo-300";
        },

        getPercentualVerde() {
            const percentuais = calcularPercentuaisSaude(this.veiculosFiltrados);
            return percentuais.verde;
        },

        getPercentualAmarelo() {
            const percentuais = calcularPercentuaisSaude(this.veiculosFiltrados);
            return percentuais.amarelo;
        },

        getPercentualVermelho() {
            const percentuais = calcularPercentuaisSaude(this.veiculosFiltrados);
            return percentuais.vermelho;
        }
    };
}
