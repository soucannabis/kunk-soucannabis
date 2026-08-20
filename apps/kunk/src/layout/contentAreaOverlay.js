/**
 * Camadas da área de conteúdo (página):
 *   menu < pesquisar global < modal da página < menus/selects do modal < toast
 *
 * Dialogs da página não cobrem o Sidebar (left + pointer-events),
 * para o menu continuar usável com modal aberto.
 */

/** Menu lateral — abaixo dos dialogs da área de conteúdo. */
export const SIDEBAR_Z = 14000;

/** Botão + dialog do Pesquisar global — abaixo dos modais de página. */
export const GLOBAL_SEARCH_Z = 16000;

/** Dialogs/Modals de página — acima do menu e do Pesquisar. */
export const CONTENT_AREA_DIALOG_Z = 17000;

/** Menus/Selects/Autocompletes portaled — acima do Dialog da página. */
export const CONTENT_AREA_OVERLAY_Z = CONTENT_AREA_DIALOG_Z + 1;

export const contentAreaSelectProps = {
  MenuProps: {
    sx: { zIndex: CONTENT_AREA_OVERLAY_Z },
  },
};

export const contentAreaAutocompleteSlotProps = {
  popper: { sx: { zIndex: CONTENT_AREA_OVERLAY_Z } },
};

/**
 * Dialogs na área de conteúdo: não cobrem o menu lateral
 * (left + pointer-events para cliques no Sidebar).
 */
export const contentAreaDialogSx = {
  zIndex: CONTENT_AREA_DIALOG_Z,
  left: 'var(--kunk-sidebar-offset, 220px)',
  right: 0,
  width: 'auto',
  pointerEvents: 'none',
  '& .MuiBackdrop-root': {
    pointerEvents: 'auto',
  },
  '& .MuiDialog-container': {
    pointerEvents: 'none',
  },
  '& .MuiDialog-paper': {
    pointerEvents: 'auto',
  },
};

/** Props padrão para Dialogs de página (foco não prende o menu/pesquisar). */
export const contentAreaDialogProps = {
  disableEnforceFocus: true,
  disableAutoFocus: true,
  // Sem scroll lock: o MUI trocaria overflow do body e compensaria a scrollbar
  // com padding, reflowando a página inteira ao abrir/fechar o modal.
  disableScrollLock: true,
  sx: contentAreaDialogSx,
};

/** MUI Modal (não Dialog) na área de conteúdo. */
export const contentAreaModalSx = {
  zIndex: CONTENT_AREA_DIALOG_Z,
  left: 'var(--kunk-sidebar-offset, 220px)',
  right: 0,
  width: 'auto',
};

/** Props padrão para Modals de página — mesmo motivo do disableScrollLock acima. */
export const contentAreaModalProps = {
  disableScrollLock: true,
  sx: contentAreaModalSx,
};
