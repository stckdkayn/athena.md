import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/context/ThemeContext';

export type AthenaDialogVariant = 'info' | 'success' | 'warning' | 'error' | 'confirm';

export interface AthenaDialogModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  variant?: AthenaDialogVariant;
  icon?: keyof typeof Ionicons.glyphMap;
  primaryButtonText?: string;
  primaryButtonVariant?: 'primary' | 'danger';
  onPrimaryPress?: () => void;
  secondaryButtonText?: string;
  onSecondaryPress?: () => void;
}

export const AthenaDialogModal: React.FC<AthenaDialogModalProps> = ({
  visible,
  onClose,
  title,
  message,
  variant = 'info',
  icon,
  primaryButtonText,
  primaryButtonVariant,
  onPrimaryPress,
  secondaryButtonText,
  onSecondaryPress,
}) => {
  const { colors, isDark } = useAppTheme();

  // Define cores e ícones padrão com base na variante
  let defaultIcon: keyof typeof Ionicons.glyphMap = 'information-circle-outline';
  let badgeColor = colors.primary;
  let badgeBg = isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.08)';

  switch (variant) {
    case 'success':
      defaultIcon = 'checkmark-circle-outline';
      badgeColor = '#10b981';
      badgeBg = isDark ? 'rgba(16, 185, 129, 0.16)' : 'rgba(16, 185, 129, 0.10)';
      break;
    case 'warning':
      defaultIcon = 'alert-circle-outline';
      badgeColor = '#f59e0b';
      badgeBg = isDark ? 'rgba(245, 158, 11, 0.16)' : 'rgba(245, 158, 11, 0.10)';
      break;
    case 'error':
      defaultIcon = 'close-circle-outline';
      badgeColor = '#ef4444';
      badgeBg = isDark ? 'rgba(239, 68, 68, 0.16)' : 'rgba(239, 68, 68, 0.10)';
      break;
    case 'confirm':
      defaultIcon = 'help-circle-outline';
      badgeColor = '#f59e0b';
      badgeBg = isDark ? 'rgba(245, 158, 11, 0.16)' : 'rgba(245, 158, 11, 0.10)';
      break;
    case 'info':
    default:
      defaultIcon = 'information-circle-outline';
      badgeColor = colors.primary;
      badgeBg = colors.primarySubtle;
      break;
  }

  const finalIcon = icon || defaultIcon;
  const isConfirm = variant === 'confirm' || (Boolean(secondaryButtonText) && Boolean(primaryButtonText));
  const finalPrimaryText = primaryButtonText || (isConfirm ? 'Confirmar' : 'Entendi');
  const finalPrimaryVariant = primaryButtonVariant || (variant === 'error' || variant === 'confirm' ? 'danger' : 'primary');

  const handlePrimaryPress = () => {
    if (onPrimaryPress) {
      onPrimaryPress();
    } else {
      onClose();
    }
  };

  const handleSecondaryPress = () => {
    if (onSecondaryPress) {
      onSecondaryPress();
    } else {
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View
          style={[
            styles.modalOverlay,
            { backgroundColor: isDark ? 'rgba(0, 0, 0, 0.78)' : 'rgba(0, 0, 0, 0.45)' },
          ]}
        >
          <TouchableWithoutFeedback>
            <View
              style={[
                styles.modalCard,
                {
                  backgroundColor: colors.surfaceCard,
                  borderColor: colors.border,
                  ...Platform.select({
                    ios: {
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 8 },
                      shadowOpacity: isDark ? 0.35 : 0.08,
                      shadowRadius: 16,
                    },
                    android: {
                      elevation: 6,
                    },
                  }),
                },
              ]}
            >
              {/* Ícone de Destaque */}
              <View style={[styles.badgeContainer, { backgroundColor: badgeBg }]}>
                <Ionicons name={finalIcon} size={28} color={badgeColor} />
              </View>

              {/* Título e Mensagem */}
              <Text style={[styles.dialogTitle, { color: colors.text }]}>{title}</Text>
              {message ? (
                <Text style={[styles.dialogMessage, { color: colors.textSecondary }]}>
                  {message}
                </Text>
              ) : null}

              {/* Ações / Botões */}
              <View style={[styles.actionsRow, isConfirm ? styles.actionsRowDouble : null]}>
                {secondaryButtonText || isConfirm ? (
                  <TouchableOpacity
                    style={[
                      styles.buttonSecondary,
                      {
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                      },
                    ]}
                    activeOpacity={0.7}
                    onPress={handleSecondaryPress}
                  >
                    <Text style={[styles.buttonSecondaryText, { color: colors.textSecondary }]}>
                      {secondaryButtonText || 'Cancelar'}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity
                  style={[
                    styles.buttonPrimary,
                    finalPrimaryVariant === 'danger'
                      ? styles.buttonDanger
                      : { backgroundColor: colors.primary },
                  ]}
                  activeOpacity={0.8}
                  onPress={handlePrimaryPress}
                >
                  <Text
                    style={[
                      styles.buttonPrimaryText,
                      finalPrimaryVariant === 'danger'
                        ? styles.buttonDangerText
                        : { color: isDark ? '#000000' : '#FFFFFF' },
                    ]}
                  >
                    {finalPrimaryText}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
  },
  badgeContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  dialogMessage: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
  },
  actionsRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'center',
    gap: 12,
  },
  actionsRowDouble: {
    justifyContent: 'space-between',
  },
  buttonSecondary: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSecondaryText: {
    fontSize: 14,
    fontWeight: '600',
  },
  buttonPrimary: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimaryText: {
    fontSize: 14,
    fontWeight: '700',
  },
  buttonDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  buttonDangerText: {
    color: '#ef4444',
  },
});
