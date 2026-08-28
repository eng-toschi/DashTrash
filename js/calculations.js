// Funções de cálculo de aderência e métricas

/**
 * Calcula a aderência geral (média ponderada)
 */
function calcularAderenciaGeral(veiculos) {
    if (veiculos.length === 0) return 100;
    
    const somaAderencias = veiculos.reduce((acc, v) => acc + v.aderencia, 0);
    return somaAderencias / veiculos.length;
}

/**
 * Conta veículos por status
 */
function contarVeiculosPorStatus(veiculos) {
    return {
        aderentes: veiculos.filter(v => v.status === "Aderente").length,
        risco: veiculos.filter(v => v.status === "Risco").length,
        atrasados: veiculos.filter(v => v.status === "Atrasado").length
    };
}

/**
 * Ordena veículos por criticidade (pior aderência primeiro)
 */
function ordenarPorCriticidade(veiculos) {
    return [...veiculos].sort((a, b) => {
        // Primeiro ordena por status (Atrasado > Risco > Aderente)
        const ordemStatus = { "Atrasado": 3, "Risco": 2, "Aderente": 1 };
        const diffStatus = ordemStatus[b.status] - ordemStatus[a.status];
        
        if (diffStatus !== 0) return diffStatus;
        
        // Se mesmo status, ordena por menor aderência
        return a.aderencia - b.aderencia;
    });
}

/**
 * Retorna os top N veículos mais críticos
 */
function getTopCriticos(veiculos, n = 5) {
    const ordenados = ordenarPorCriticidade(veiculos);
    return ordenados.slice(0, n);
}

/**
 * Calcula percentual de cada categoria para a barra de saúde
 */
function calcularPercentuaisSaude(veiculos) {
    if (veiculos.length === 0) {
        return { verde: 100, amarelo: 0, vermelho: 0 };
    }
    
    const contagem = contarVeiculosPorStatus(veiculos);
    const total = veiculos.length;
    
    return {
        verde: (contagem.aderentes / total) * 100,
        amarelo: (contagem.risco / total) * 100,
        vermelho: (contagem.atrasados / total) * 100
    };
}

/**
 * Filtra veículos por fazenda
 */
function filtrarPorFazenda(veiculos, fazendaFiltro) {
    if (!fazendaFiltro || fazendaFiltro === "") {
        return veiculos;
    }
    return veiculos.filter(v => v.fazenda === fazendaFiltro);
}

/**
 * Extrai lista única de fazendas
 */
function extrairFazendasUnicas(veiculos) {
    const fazendas = new Set(veiculos.map(v => v.fazenda));
    return Array.from(fazendas).sort();
}

/**
 * Busca veículos por termo (placa, motorista, fazenda)
 */
function buscarVeiculos(veiculos, termoBusca) {
    if (!termoBusca || termoBusca.trim() === "") {
        return veiculos;
    }
    
    const termo = termoBusca.toLowerCase().trim();
    return veiculos.filter(v => 
        v.placa.toLowerCase().includes(termo) ||
        v.motorista.toLowerCase().includes(termo) ||
        v.fazenda.toLowerCase().includes(termo)
    );
}

/**
 * Filtra veículos por múltiplos critérios
 */
function filtrarVeiculos(veiculos, filtros) {
    let resultado = [...veiculos];
    
    // Busca por termo
    if (filtros.busca) {
        resultado = buscarVeiculos(resultado, filtros.busca);
    }
    
    // Filtro por status
    if (filtros.status && filtros.status.length > 0) {
        resultado = resultado.filter(v => filtros.status.includes(v.status));
    }
    
    // Filtro por etapa
    if (filtros.etapa && filtros.etapa.length > 0) {
        resultado = resultado.filter(v => filtros.etapa.includes(v.etapa));
    }
    
    // Filtro por fazenda (múltipla seleção)
    if (filtros.fazendas && filtros.fazendas.length > 0) {
        resultado = resultado.filter(v => filtros.fazendas.includes(v.fazenda));
    }
    
    // Filtro por faixa de aderência
    if (filtros.aderenciaMin !== undefined) {
        resultado = resultado.filter(v => v.aderencia >= filtros.aderenciaMin);
    }
    if (filtros.aderenciaMax !== undefined) {
        resultado = resultado.filter(v => v.aderencia <= filtros.aderenciaMax);
    }
    
    return resultado;
}

/**
 * Aplica paginação a uma lista de veículos
 */
function paginarVeiculos(veiculos, paginaAtual, itensPorPagina) {
    const inicio = (paginaAtual - 1) * itensPorPagina;
    const fim = inicio + itensPorPagina;
    return {
        dados: veiculos.slice(inicio, fim),
        totalPaginas: Math.ceil(veiculos.length / itensPorPagina),
        totalItens: veiculos.length
    };
}

/**
 * Debounce helper para otimizar buscas
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

