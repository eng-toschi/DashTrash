// Gerador de dados mockados realistas para o dashboard

const FAZENDAS = [
    "Fazenda Horizonte",
    "Fazenda São José",
    "Fazenda Verde Vale",
    "Fazenda Santa Maria",
    "Fazenda Nova Esperança",
    "Fazenda Bela Vista",
    "Fazenda Rio Grande"
];

const MOTORISTAS = [
    "João Silva",
    "Carlos Lima",
    "Maria Santos",
    "Pedro Oliveira",
    "Ana Costa",
    "Roberto Alves",
    "Fernanda Souza",
    "Lucas Pereira",
    "Juliana Ferreira",
    "Marcos Rodrigues",
    "Patricia Gomes",
    "Ricardo Martins"
];

// Gera uma placa única baseada em um índice
function gerarPlaca(index) {
    const letras = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
    const num = index % 10000;
    const letra1 = letras[Math.floor(index / 10000) % 26];
    const letra2 = letras[Math.floor(index / 260000) % 26];
    const letra3 = letras[Math.floor(index / 6760000) % 26];
    return `${letra3}${letra2}${letra1}-${String(num).padStart(4, '0')}`;
}

// Gera um motorista aleatório
function gerarMotorista() {
    return MOTORISTAS[Math.floor(Math.random() * MOTORISTAS.length)];
}

// Gera uma fazenda aleatória
function gerarFazenda() {
    return FAZENDAS[Math.floor(Math.random() * FAZENDAS.length)];
}

// Gera velocidade baseada na fazenda (simulação - na prática viria do cadastro)
function gerarVelocidadeIda() {
    return 50 + Math.random() * 20; // Entre 50 e 70 km/h
}

function gerarVelocidadeVolta() {
    return 40 + Math.random() * 15; // Entre 40 e 55 km/h (carregado)
}

// Gera distância total (ida + volta)
function gerarDistanciaTotal() {
    return 80 + Math.random() * 120; // Entre 80 e 200 km
}

// Gera dados de um veículo
function gerarVeiculo(index) {
    const fazenda = gerarFazenda();
    const etapa = Math.random() > 0.5 ? "IDA" : "VOLTA";
    const velocidadeIda = gerarVelocidadeIda();
    const velocidadeVolta = gerarVelocidadeVolta();
    const distanciaTotal = gerarDistanciaTotal();
    const distanciaEtapa = distanciaTotal / 2; // Aproximação
    
    // Tempo de início da etapa (últimas 2-6 horas)
    const horasAtras = 2 + Math.random() * 4;
    const inicioEtapa = new Date(Date.now() - horasAtras * 60 * 60 * 1000);
    
    // Velocidade atual da etapa
    const velocidadeAtual = etapa === "IDA" ? velocidadeIda : velocidadeVolta;
    
    // Tempo decorrido (em minutos, excluindo almoço se houver)
    const tempoDecorridoMinutos = horasAtras * 60;
    
    // Chance de estar em almoço (20%)
    const emAlmoco = Math.random() < 0.2;
    
    // Se está em almoço, subtrair tempo de almoço (30-60 min)
    let tempoEfetivo = tempoDecorridoMinutos;
    let tempoAlmoco = 0;
    if (emAlmoco) {
        tempoAlmoco = 30 + Math.random() * 30;
        tempoEfetivo = tempoDecorridoMinutos - tempoAlmoco;
    }
    
    // KM previsto baseado na velocidade planejada
    const kmPrevisto = (velocidadeAtual * tempoEfetivo) / 60;
    
    // KM executado (simular variação de aderência)
    // Alguns veículos aderentes, alguns em risco, alguns atrasados
    const tipoAderencia = Math.random();
    let fatorAderencia;
    
    if (tipoAderencia < 0.4) {
        // 40% aderentes (95-105%)
        fatorAderencia = 0.95 + Math.random() * 0.1;
    } else if (tipoAderencia < 0.7) {
        // 30% em risco (85-95%)
        fatorAderencia = 0.85 + Math.random() * 0.1;
    } else {
        // 30% atrasados (60-85%)
        fatorAderencia = 0.60 + Math.random() * 0.25;
    }
    
    const kmExecutado = kmPrevisto * fatorAderencia;
    const diferenca = kmExecutado - kmPrevisto;
    const aderencia = (kmExecutado / kmPrevisto) * 100;
    
    // Determinar status
    let status;
    if (aderencia >= 95) {
        status = "Aderente";
    } else if (aderencia >= 85) {
        status = "Risco";
    } else {
        status = "Atrasado";
    }
    
    return {
        placa: gerarPlaca(index),
        motorista: gerarMotorista(),
        fazenda: fazenda,
        etapa: etapa,
        velocidadeIda: velocidadeIda,
        velocidadeVolta: velocidadeVolta,
        distanciaTotal: distanciaTotal,
        inicioEtapa: inicioEtapa.toISOString(),
        kmPrevisto: Math.max(0, kmPrevisto),
        kmExecutado: Math.max(0, kmExecutado),
        diferenca: diferenca,
        aderencia: aderencia,
        status: status,
        emAlmoco: emAlmoco,
        tempoDecorrido: tempoDecorridoMinutos,
        tempoAlmoco: tempoAlmoco,
        eventos: [
            {
                tipo: etapa === "IDA" ? "INICIO_IDA" : "INICIO_VOLTA",
                timestamp: inicioEtapa.toISOString()
            },
            ...(emAlmoco ? [{
                tipo: "ALMOCO_INICIO",
                timestamp: new Date(inicioEtapa.getTime() + (tempoDecorridoMinutos - tempoAlmoco) * 60 * 1000).toISOString()
            }] : [])
        ]
    };
}

// Gera conjunto completo de veículos
function gerarDadosMockados(numVeiculos = 15) {
    const veiculos = [];
    
    // Gerar veículos com placas únicas baseadas no índice
    for (let i = 0; i < numVeiculos; i++) {
        veiculos.push(gerarVeiculo(i));
    }
    
    return {
        veiculos: veiculos,
        ultimaAtualizacao: new Date().toISOString()
    };
}

// Atualiza dados mockados (simula mudanças ao longo do tempo)
function atualizarDadosMockados(dadosAnteriores) {
    const novosDados = {
        veiculos: dadosAnteriores.veiculos.map(veiculo => {
            // Criar novo objeto para evitar mutação
            const atualizado = { ...veiculo };
            
            // Atualizar tempo decorrido (+2 minutos)
            atualizado.tempoDecorrido += 2;
            
            // Atualizar KM previsto
            const velocidadeAtual = atualizado.etapa === "IDA" 
                ? atualizado.velocidadeIda 
                : atualizado.velocidadeVolta;
            
            let tempoEfetivo = atualizado.tempoDecorrido;
            if (atualizado.emAlmoco) {
                tempoEfetivo = atualizado.tempoDecorrido - atualizado.tempoAlmoco;
            }
            
            atualizado.kmPrevisto = (velocidadeAtual * tempoEfetivo) / 60;
            
            // Atualizar KM executado (com pequena variação)
            const variacao = (Math.random() - 0.5) * 0.5; // -0.25 a +0.25 km
            atualizado.kmExecutado = Math.max(0, atualizado.kmExecutado + variacao);
            
            // Recalcular diferença e aderência
            atualizado.diferenca = atualizado.kmExecutado - atualizado.kmPrevisto;
            atualizado.aderencia = atualizado.kmPrevisto > 0 
                ? (atualizado.kmExecutado / atualizado.kmPrevisto) * 100 
                : 0;
            
            // Atualizar status
            if (atualizado.aderencia >= 95) {
                atualizado.status = "Aderente";
            } else if (atualizado.aderencia >= 85) {
                atualizado.status = "Risco";
            } else {
                atualizado.status = "Atrasado";
            }
            
            // Simular fim de almoço (10% de chance a cada atualização)
            if (atualizado.emAlmoco && Math.random() < 0.1) {
                atualizado.emAlmoco = false;
            }
            
            // Simular início de almoço (5% de chance se não estiver em almoço)
            if (!atualizado.emAlmoco && Math.random() < 0.05) {
                atualizado.emAlmoco = true;
                atualizado.tempoAlmoco = 30 + Math.random() * 30;
            }
            
            return atualizado;
        }),
        ultimaAtualizacao: new Date().toISOString()
    };
    
    return novosDados;
}

