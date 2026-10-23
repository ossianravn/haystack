import mark from '../icons/haystack-mark.svg';

export function Brand() {
  return <span className="brand"><img src={mark} alt="" /><span>haystack<span className="brand-period">.</span></span></span>;
}
