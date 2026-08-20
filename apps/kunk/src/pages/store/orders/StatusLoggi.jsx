import React from 'react';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import ErrorIcon from '@mui/icons-material/Error';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import UndoIcon from '@mui/icons-material/Undo';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import StoreIcon from '@mui/icons-material/Store';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import PaidIcon from '@mui/icons-material/Paid';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';

const statusConfig = {
  'Adicionado no sistema': { icon: <StoreIcon />, color: '#9019d2' },
  'Erro ao gerar etiqueta': { icon: <ErrorIcon />, color: '#b71c1c' },
  Cancelado: { icon: <CancelIcon />, color: '#b71c1c' },
  'Preparando para transferência': { icon: <AutorenewIcon />, color: '#1976d2' },
  'Preparando para entrega': { icon: <AutorenewIcon />, color: '#1976d2' },
  Entregue: { icon: <CheckCircleIcon />, color: '#388e3c' },
  'Recusado pelo destinatário': { icon: <CancelIcon />, color: '#b71c1c' },
  'Devolução iniciada': { icon: <UndoIcon />, color: '#ffa000' },
  Devolvido: { icon: <UndoIcon />, color: '#ffa000' },
  Extraviado: { icon: <ErrorIcon />, color: '#b71c1c' },
  'Retirar nos correios': { icon: <StoreIcon />, color: '#1976d2' },
  'Em rota': { icon: <LocalShippingIcon />, color: '#1976d2' },
  'Imprevisto na entrega': { icon: <WarningAmberIcon />, color: '#ffa000' },
  Conferido: { icon: <CheckCircleIcon />, color: '#388e3c' },
  Coletado: { icon: <LocalShippingIcon />, color: '#1976d2' },
  'Medido e pesado': { icon: <CheckCircleIcon />, color: '#388e3c' },
  'Saiu de uma base': { icon: <LocalShippingIcon />, color: '#1976d2' },
  'Chegou em uma base': { icon: <StoreIcon />, color: '#1976d2' },
  'Destinatário ausente': { icon: <WarningAmberIcon />, color: '#ffa000' },
  Avariado: { icon: <ErrorIcon />, color: '#b71c1c' },
  'Pendência interna': { icon: <WarningAmberIcon />, color: '#ffa000' },
  'Endereço errado': { icon: <ErrorIcon />, color: '#b71c1c' },
  'Aguardando ação do remetente': { icon: <WarningAmberIcon />, color: '#ffa000' },
  'Roubado ou furtado': { icon: <ErrorIcon />, color: '#b71c1c' },
  'Aguardando liberação fiscal': { icon: <WarningAmberIcon />, color: '#ffa000' },
  'Liberado pela fiscalização': { icon: <CheckCircleIcon />, color: '#388e3c' },
  'Pacote não integrado': { icon: <ErrorIcon />, color: '#b71c1c' },
  'Coleta pendente': { icon: <WarningAmberIcon />, color: '#ffa000' },
  'Entregue a transportadora': { icon: <LocalShippingIcon />, color: '#1976d2' },
  'Aguardando pagamento': { icon: <MonetizationOnIcon />, color: '#0092ff' },
  'Pagamento concluído': { icon: <PaidIcon />, color: '#388e3c' },
  'Aguardando aprovação': { icon: <HourglassEmptyIcon />, color: '#1565c0' },
  'Produção Finalizada': { icon: <Inventory2Icon />, color: '#388e3c' },
  'Em produção': { icon: <Inventory2Icon />, color: '#1976d2' },
  Enviado: { icon: <LocalShippingIcon />, color: '#1976d2' },
  'Carrinho Melhor Envio': { icon: <HourglassEmptyIcon />, color: '#1976d2' },
};

/** Status visual legado (ícone + cor). */
export default function StatusLoggi({ status, emphasized = false }) {
  const config = statusConfig[status] || { icon: <HelpOutlineIcon />, color: '#888' };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        color: config.color,
        fontWeight: emphasized ? 700 : 500,
        fontSize: emphasized ? 22 : 14,
        whiteSpace: 'nowrap',
      }}
    >
      {emphasized ? (
        <>
          <span style={{ textAlign: 'right' }}>{status}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 28, flexShrink: 0 }}>
            {config.icon}
          </span>
        </>
      ) : (
        <>
          {config.icon}
          {status}
        </>
      )}
    </span>
  );
}
