<?php

namespace Stezkoy\Feed2forum\Provider;

use Stezkoy\Feed2forum\Support\WorkLog;
use Flarum\Foundation\AbstractServiceProvider;

/**
 * Binds the work log as a container singleton so every consumer (jobs, API
 * resources, the fetcher) shares one instance and can be intercepted in tests.
 */
class WorkLogServiceProvider extends AbstractServiceProvider
{
    public function register(): void
    {
        $this->container->singleton(WorkLog::class);
    }
}