import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import {
  useAdminUsers,
  useSetUserRole,
  useDeleteUser,
  useResetPassword,
} from '@/hooks/useAdminUsers';
import TemporaryPasswordModal from '@/components/TemporaryPasswordModal';
import type { AppRole, TemporaryPassword } from '@/types';
import styles from './UserManagementPage.module.css';

const ROLE_OPTIONS: AppRole[] = ['anonymous', 'taster', 'admin'];

export default function UserManagementPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: users, isLoading, error } = useAdminUsers();
  const setUserRole = useSetUserRole();
  const deleteUser = useDeleteUser();
  const resetPassword = useResetPassword();
  const [issued, setIssued] = useState<
    (TemporaryPassword & { userName: string }) | null
  >(null);

  const handleResetPassword = async (id: string, name: string) => {
    if (!confirm(t('userManagement.confirmResetPassword', { name }))) {
      return;
    }
    try {
      const result = await resetPassword.mutateAsync(id);
      setIssued({ ...result, userName: name });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      alert(
        e?.response?.data?.message ?? t('userManagement.resetPasswordFailed'),
      );
    }
  };

  const handleRemove = async (id: string, name: string) => {
    if (!confirm(t('userManagement.confirmRemove', { name }))) {
      return;
    }
    try {
      await deleteUser.mutateAsync(id);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      alert(e?.response?.data?.message ?? t('userManagement.removeFailed'));
    }
  };

  const handleRoleChange = async (id: string, role: AppRole) => {
    if (
      !confirm(
        t('userManagement.confirmRoleChange', {
          role: t(`userManagement.roles.${role}`),
        }),
      )
    ) {
      return;
    }
    try {
      await setUserRole.mutateAsync({ id, role });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const e = err as { response?: { data?: { message?: string } } };
        alert(e.response?.data?.message ?? t('userManagement.updateFailed'));
      } else {
        alert(t('userManagement.updateFailed'));
      }
    }
  };

  if (isLoading)
    return <div className={styles.loading}>{t('common.loading')}</div>;
  if (error)
    return <div className={styles.error}>{t('userManagement.loadFailed')}</div>;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t('userManagement.title')}</h1>

      {users?.length === 0 ? (
        <div className={styles.empty}>{t('userManagement.emptyMessage')}</div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('userManagement.columns.email')}</th>
                <th>{t('userManagement.columns.displayName')}</th>
                <th>{t('userManagement.columns.role')}</th>
                <th>
                  <span className={styles.srOnly}>
                    {t('userManagement.columns.actions')}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users?.map((u) => {
                const isSelf = u.id === user?.id;
                return (
                  <tr key={u.id}>
                    <td>
                      {u.authProvider === 'local' && u.username ? (
                        <>
                          {u.username}{' '}
                          <span className={styles.accountType}>
                            {t('userManagement.usernameAccount')}
                          </span>
                        </>
                      ) : (
                        u.email
                      )}
                    </td>
                    <td>{u.displayName}</td>
                    <td>
                      <select
                        className={styles.roleSelect}
                        value={u.role}
                        disabled={isSelf || setUserRole.isPending}
                        onChange={(e) =>
                          handleRoleChange(u.id, e.target.value as AppRole)
                        }
                        title={
                          isSelf
                            ? t('userManagement.cannotChangeSelf')
                            : undefined
                        }
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>
                            {t(`userManagement.roles.${role}`)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={styles.actions}>
                      {u.authProvider === 'local' && !isSelf && (
                        <button
                          type="button"
                          className={styles.resetBtn}
                          disabled={resetPassword.isPending}
                          onClick={() =>
                            handleResetPassword(u.id, u.displayName)
                          }
                          aria-label={t('userManagement.resetPasswordFor', {
                            name: u.displayName,
                          })}
                        >
                          {t('userManagement.resetPassword')}
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.removeBtn}
                        disabled={isSelf || deleteUser.isPending}
                        onClick={() => handleRemove(u.id, u.displayName)}
                        title={
                          isSelf
                            ? t('userManagement.cannotRemoveSelf')
                            : undefined
                        }
                        aria-label={t('userManagement.removeUser', {
                          name: u.displayName,
                        })}
                      >
                        {t('userManagement.remove')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {issued && (
        <TemporaryPasswordModal
          userName={issued.userName}
          temporaryPassword={issued.temporaryPassword}
          expiresAt={issued.expiresAt}
          onClose={() => setIssued(null)}
        />
      )}
    </div>
  );
}
