// Skeleton loader animado — feedback visual durante carregamento
export const Skeleton = ({ className = "" }) => (
  <div className={`bg-white/5 animate-pulse rounded-xl ${className}`} />
);

export const SkeletonRestauranteCard = () => (
  <div className="bg-[#111] rounded-3xl overflow-hidden">
    <Skeleton className="w-full h-40 rounded-none" />
    <div className="p-4 flex flex-col gap-2">
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <div className="flex gap-2 mt-2">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
    </div>
  </div>
);

export const SkeletonProduto = () => (
  <div className="flex items-center gap-4 p-4 bg-white/3 rounded-2xl">
    <Skeleton className="w-16 h-16 rounded-xl shrink-0" />
    <div className="flex-1 flex flex-col gap-2">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-4 w-20" />
    </div>
    <Skeleton className="w-20 h-9 rounded-xl shrink-0" />
  </div>
);
