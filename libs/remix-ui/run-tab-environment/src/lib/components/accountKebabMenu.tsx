import React from 'react'
import { Overlay } from 'react-bootstrap'
import { Account } from '../types'

interface AccountKebabMenuProps {
  show: boolean
  target: HTMLElement
  onHide: () => void
  account: Account
  menuIndex?: string | number
  onNewAccount: () => void
  onCreateSmartAccount: (account: Account) => void
  onAuthorizeDelegation: (account: Account) => void
  onSignUsingAccount: (account: Account) => void
  onDeleteAccount: (account: Account) => void
}

const MenuContent = React.forwardRef<HTMLElement, any>((props, ref) => {
  const { children, style, popper, show, hasDoneInitialMeasure, arrowProps, ...rest } = props
  return (
    <section
      ref={ref}
      style={{
        minWidth: 200,
        zIndex: 9999,
        ...style,
      }}
      {...rest}
    >
      {children}
    </section>
  )
})

MenuContent.displayName = 'MenuContent'

export const AccountKebabMenu: React.FC<AccountKebabMenuProps> = ({
  show,
  target,
  onHide,
  account,
  menuIndex = 'default',
  onNewAccount,
  onCreateSmartAccount,
  onAuthorizeDelegation,
  onSignUsingAccount,
  onDeleteAccount
}) => {
  return (
    <Overlay
      show={show}
      target={target}
      placement="right-start"
      container={document.body}
      popperConfig={{
        modifiers: [
          { name: "offset", options: { offset: [-4, 22]} },
          { name: "preventOverflow", options: { boundary: "viewport", padding: 8 } },
          { name: 'flip', options: { enabled: false } }
        ],
      }}
      rootClose
      transition={false}
      onHide={onHide}
    >
      {(props) => (
        <MenuContent {...props} data-id={`accountKebabMenu-${menuIndex}`}>
          <div className="p-0 rounded w-100" style={{ backgroundColor: 'var(--bs-light)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)' }}>
            <div className="d-flex flex-column">
              <div
                className="d-flex align-items-center px-3 py-2"
                data-id="newAccount"
                onClick={(e) => {
                  e.stopPropagation()
                  onNewAccount()
                }}
                style={{
                  color: 'var(--bs-body-color)',
                  cursor: 'pointer',
                  borderTopLeftRadius: 8,
                  borderTopRightRadius: 8,
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bs-secondary-bg)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <span className="me-2">
                  <i className="fas fa-plus" />
                </span>
                <span>New account</span>
              </div>
              <div
                className="d-flex align-items-center px-3 py-2"
                data-id="createSmartAccount"
                onClick={(e) => {
                  e.stopPropagation()
                  onCreateSmartAccount(account)
                }}
                style={{
                  color: 'var(--bs-body-color)',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bs-secondary-bg)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <span className="me-2">
                  <i className="fas fa-plus" />
                </span>
                <span>Create smart account</span>
              </div>
              <div
                className="d-flex align-items-center px-3 py-2"
                data-id="authorizeDelegation"
                onClick={(e) => {
                  e.stopPropagation()
                  onAuthorizeDelegation(account)
                }}
                style={{
                  color: 'var(--bs-body-color)',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bs-secondary-bg)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <span className="me-2">
                  <i className="fas fa-check" />
                </span>
                <span>Authorize delegation</span>
              </div>
              <div
                className="d-flex align-items-center px-3 py-2"
                data-id="signUsingAccount"
                onClick={(e) => {
                  e.stopPropagation()
                  onSignUsingAccount(account)
                }}
                style={{
                  color: 'var(--bs-body-color)',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bs-secondary-bg)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <span className="me-2">
                  <i className="fa-regular fa-pen-to-square" />
                </span>
                <span>Sign using this account</span>
              </div>
              <div
                className="d-flex align-items-center px-3 py-2"
                data-id="deleteAccount"
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteAccount(account)
                }}
                style={{
                  color: 'var(--bs-danger)',
                  cursor: 'pointer',
                  borderBottomLeftRadius: 8,
                  borderBottomRightRadius: 8,
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bs-secondary-bg)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <span className="me-2">
                  <i className="fas fa-trash" />
                </span>
                <span>Delete account</span>
              </div>
            </div>
          </div>
        </MenuContent>
      )}
    </Overlay>
  )
}
