import styles from './CheckoutPage.module.css';

export default function CheckoutBrand() {
  return <span className={styles.brand}>
    <img src="/favicon.svg" width="27" height="27" alt="" />
    <span>Velora</span>
  </span>;
}
