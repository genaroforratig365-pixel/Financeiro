-- Remove registros com áreas criadas incorretamente durante importação
-- Mantém apenas áreas com ID de 2 a 15

-- Deletar pagamentos por área com IDs inválidos
DELETE FROM financas.pag_pagamentos_area
WHERE pag_are_id IN (16, 17, 18, 19, 20);

-- Deletar previsões com IDs inválidos
DELETE FROM financas.pvi_previsao_itens
WHERE pvi_are_id IN (16, 17, 18, 19, 20);

-- Deletar as áreas criadas incorretamente
DELETE FROM financas.are_areas
WHERE are_id IN (16, 17, 18, 19, 20);

NOTIFY pgrst, 'reload schema';
