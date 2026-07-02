import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useAdminUsers, useSetUserRole } from '@/hooks/useAdminUsers';
import type { AppRole } from '@/types';
import styles from './UserManagementPage.module.css';

const ROLE_OPTIONS: AppRole[] = ['anonymous', 'taster', 'admin'];

export default function UserManagementPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: users, isLoading, error } = useAdminUsers();
  const setUserRole = useSetUserRole();

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
              </tr>
            </thead>
            <tbody>
              {users?.map((u) => {
                const isSelf = u.id === user?.id;
                return (
                  <tr key={u.id}>
                    <td>{u.email}</td>
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
